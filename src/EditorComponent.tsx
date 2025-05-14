import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import CommentExtension from "@sereneinserenade/tiptap-comment-extension";
import { useState, useEffect, useCallback } from "react";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import {
  parse as jsoncParse,
  getLocation,
  printParseErrorCode,
} from "jsonc-parser";
import type { Location } from "jsonc-parser";

interface EditorComponentProps {
  apiKey: string;
}

// Specific debounce function for callGeminiApi
function debounceGeminiSpecific(
  func: (text: string) => Promise<void>,
  waitFor: number
): (text: string) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (text: string): void => {
    console.log(
      "[Debounce] Will call function with:",
      text.substring(0, 30) + "..."
    ); // Log when debounce is triggered
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      console.log(
        "[Debounce] Executing debounced function with:",
        text.substring(0, 30) + "..."
      ); // Log when function actually executes
      func(text);
    }, waitFor);
  };
}

interface GeminiComment {
  exact_quote: string;
  comment: string;
}

interface GeminiResponse {
  comments: GeminiComment[];
}

const EditorComponent = ({ apiKey }: EditorComponentProps) => {
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  // Store comments retrieved from Gemini
  const [geminiComments, setGeminiComments] = useState<Record<string, string>>(
    {}
  );

  console.log(
    "[EditorComponent] Rendering with API Key:",
    apiKey ? "SET" : "NOT SET"
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      CommentExtension.configure({
        HTMLAttributes: {
          class: "my-comment",
        },
        // When a comment mark is clicked, show the comment from our state
        onCommentActivated: (commentId) => {
          console.log("[Editor] Comment activated:", commentId);
          setActiveCommentId(commentId);
        },
      }),
    ],
    content: "<p>Start typing here and Gemini will try to add comments...</p>",
    // Trigger onUpdate when editor content changes
    onUpdate: ({ editor: currentEditor }) => {
      const currentText = currentEditor.getText();
      console.log(
        "[Editor] onUpdate triggered. API Key:",
        apiKey ? "SET" : "NOT SET",
        "Text length:",
        currentText.length
      );
      if (apiKey && currentText.trim().length > 0) {
        // Ensure text is not empty
        handleContentUpdate(currentText);
      }
    },
  });

  const callGeminiApi = async (text: string) => {
    console.log(
      "[callGeminiApi] Attempting to call Gemini. API Key:",
      apiKey ? "SET" : "NOT SET"
    );
    if (!apiKey) {
      console.warn("[callGeminiApi] Gemini API key is not set. Aborting.");
      return;
    }
    if (text.trim().length === 0) {
      console.log("[callGeminiApi] Text is empty. Aborting.");
      return;
    }
    console.log(
      "Calling Gemini API with text:",
      text.substring(0, 100) + "..."
    );

    const genAI = new GoogleGenerativeAI(apiKey);

    const generationConfig = {
      temperature: 0.7,
      topP: 0.95,
      topK: 64,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    };

    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
    ];

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
      generationConfig,
      safetySettings,
    });

    const prompt = `Given the following text, please identify specific phrases or sentences (exact quotes) that could be commented on for clarity, improvement, or to add context. For each identified quote, provide a concise comment. Please return the response as a JSON object with a single key "comments", which is an array of objects. Each object in the array should have two keys: "exact_quote" (the exact text to be commented on) and "comment" (your suggested comment). Please ensure the JSON is well-formed.

Text:
---
${text}
---

Example Response Format:
{
  "comments": [
    {"exact_quote": "This is a phrase.", "comment": "Consider rephrasing for clarity."},
    {"exact_quote": "Another sentence here.", "comment": "This could be expanded with more details."}
    // It's okay if there's a trailing comma here, my parser can handle it.
  ]
}
`;

    try {
      console.log("[callGeminiApi] Sending prompt to Gemini...");
      const result = await model.generateContentStream([{ text: prompt }]);

      let streamedResponseText = "";
      for await (const chunk of result.stream) {
        streamedResponseText += chunk.text();
      }

      console.log("Gemini Raw Response Text:", streamedResponseText);

      // Attempt to find the JSON part if the response isn't pure JSON
      const jsonMatch = streamedResponseText.match(/\{.*?\}/s);
      if (!jsonMatch) {
        console.error(
          "Gemini API response does not contain valid JSON structure:",
          streamedResponseText
        );
        return;
      }
      const jsonString = jsonMatch[0];
      console.log("Gemini Extracted JSON-like string:", jsonString);

      const errors: { error: number; offset: number; length: number }[] = [];
      const responseData = jsoncParse(jsonString, errors) as GeminiResponse;

      if (errors.length > 0) {
        console.warn(
          "[callGeminiApi] Issues found while parsing JSONC. Attempting to use anyway."
        );
        errors.forEach((e) => {
          const location: Location = getLocation(jsonString, e.offset);
          console.warn(
            `  - Error: ${printParseErrorCode(e.error)} at line ${
              location.line + 1
            }, character ${location.character + 1}`
          );
        });
        // If responseData is still undefined after permissive parse, or critical error, then fail.
        if (!responseData || !responseData.comments) {
          // Check if essential 'comments' array is missing
          console.error(
            "[callGeminiApi] Failed to parse critical JSON structure even with jsonc-parser. Content:",
            jsonString
          );
          return;
        }
      }
      console.log("Gemini Parsed Response (with jsonc-parser):", responseData);

      if (responseData && responseData.comments && editor) {
        const newComments: Record<string, string> = {};
        responseData.comments.forEach((item, index) => {
          const { exact_quote, comment } = item;
          // Basic validation, as jsoncParse is permissive
          if (typeof exact_quote !== "string" || typeof comment !== "string") {
            console.warn(
              "[callGeminiApi] Invalid comment item received after parsing:",
              item
            );
            return; // Skip this item
          }
          const commentId = `gemini-comment-${Date.now()}-${index}`;
          newComments[commentId] = comment;
          console.log(
            `[callGeminiApi] Prepared comment ID ${commentId} for "${exact_quote}": "${comment}"`
          );

          const textContent = editor.state.doc.textContent;
          let from = -1;
          let to = -1;
          let searchPos = 0;

          while (searchPos < textContent.length) {
            const currentMatchPos = textContent.indexOf(exact_quote, searchPos);
            if (currentMatchPos === -1) break;

            let alreadyCommented = false;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            editor.state.doc.nodesBetween(
              currentMatchPos,
              currentMatchPos + exact_quote.length,
              (node, _) => {
                if (
                  node.marks.some(
                    (mark) => mark.type.name === CommentExtension.name
                  )
                ) {
                  alreadyCommented = true;
                  return false;
                }
              }
            );

            if (!alreadyCommented) {
              from = currentMatchPos;
              to = currentMatchPos + exact_quote.length;
              console.log(
                `[callGeminiApi] Found uncommented quote "${exact_quote}" at [${from}, ${to}]`
              );
              break;
            }
            searchPos = currentMatchPos + exact_quote.length;
            console.log(
              `[callGeminiApi] Quote "${exact_quote}" at ${currentMatchPos} is already commented or overlap. Searching next.`
            );
          }

          if (from !== -1 && to !== -1) {
            console.log(
              `[callGeminiApi] Applying comment '${comment}' to "${exact_quote}" at [${from}, ${to}] with ID ${commentId}`
            );
            editor
              .chain()
              .setTextSelection({ from, to })
              .setComment(commentId)
              .run();
          } else {
            console.warn(
              `[callGeminiApi] Could not find or already commented on quote: "${exact_quote}"`
            );
          }
        });
        setGeminiComments((prev) => ({ ...prev, ...newComments }));
      }
    } catch (error) {
      console.error("Error calling Gemini API or processing response:", error);
      // No longer assuming JSON.parse is the only source of error here
      if (
        error instanceof Error &&
        error.message.includes("API key not valid")
      ) {
        alert("Invalid Gemini API Key. Please check and try again.");
      }
    }
  };

  // Debounced version of the API call
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleContentUpdate = useCallback(
    debounceGeminiSpecific(callGeminiApi, 2000),
    [apiKey, editor]
  ); // Recreate if apiKey or editor changes

  useEffect(() => {
    console.log(
      "[EditorComponent] useEffect for editor/apiKey. API Key:",
      apiKey ? "SET" : "NOT SET"
    );
    if (!editor) {
      return;
    }
    // Clear comments if API key is removed or editor is destroyed
    return () => {
      console.log("[EditorComponent] Cleanup effect for editor/apiKey.");
      setGeminiComments({});
    };
  }, [editor, apiKey]);

  return (
    <>
      <EditorContent editor={editor} />
      {activeCommentId && geminiComments[activeCommentId] && (
        <div
          style={{
            marginTop: "10px",
            padding: "10px",
            border: "1px solid blue",
          }}
        >
          <strong>Comment:</strong> {geminiComments[activeCommentId]}
        </div>
      )}
    </>
  );
};

export default EditorComponent;
