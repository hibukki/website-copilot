import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import CommentExtension from "@sereneinserenade/tiptap-comment-extension";
import { useEffect, useCallback, useRef } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { parse as jsoncParse } from "jsonc-parser";
import type { CommentDetail } from "./App"; // Import CommentDetail

interface EditorComponentProps {
  apiKey: string;
  activeCommentId: string | null;
  setActiveCommentId: (id: string | null) => void;
  geminiCommentsFromApp: Record<string, CommentDetail>; // Expecting full detail
  onNewCommentsReady: (comments: Record<string, CommentDetail>) => void;
}

// Specific debounce function for callGeminiApi
function debounceGeminiSpecific(
  func: (text: string) => Promise<void>,
  waitFor: number
): (text: string) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (text: string): void => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func(text);
    }, waitFor);
  };
}

interface GeminiCommentResponseItem {
  exact_quote: string;
  comment: string;
}

interface GeminiResponse {
  comments: GeminiCommentResponseItem[];
}

const EditorComponent = ({
  apiKey,
  setActiveCommentId,
  geminiCommentsFromApp,
  onNewCommentsReady,
}: EditorComponentProps) => {
  const prevGeminiCommentsRef = useRef<Record<string, CommentDetail>>(
    geminiCommentsFromApp
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      CommentExtension.configure({
        HTMLAttributes: {
          class: "my-comment",
        },
        // When a comment mark is clicked, show the comment from our state
        onCommentActivated: setActiveCommentId,
      }),
    ],
    content: "<p>Start typing here and Gemini will try to add comments...</p>",
    // Trigger onUpdate when editor content changes
    onUpdate: ({ editor: currentEditor }) => {
      const currentText = currentEditor.getText();
      if (apiKey && currentText.trim().length > 0) {
        handleContentUpdate(currentText);
      }
    },
  });

  useEffect(() => {
    if (!editor) return;

    const currentCommentsEmpty =
      Object.keys(geminiCommentsFromApp).length === 0;
    const prevCommentsEmpty =
      Object.keys(prevGeminiCommentsRef.current).length === 0;

    // If current app comments are empty, and previously they were not, it means clear was intended.
    if (currentCommentsEmpty && !prevCommentsEmpty) {
      console.log(
        "[EditorComponent] Detected geminiCommentsFromApp is empty. Clearing all visual comment marks."
      );
      const tr = editor.state.tr;
      let marksCleared = false;
      editor.state.doc.descendants((node, pos) => {
        if (
          node.marks.some((mark) => mark.type.name === CommentExtension.name)
        ) {
          tr.removeMark(
            pos,
            pos + node.nodeSize,
            editor.schema.marks[CommentExtension.name]
          );
          marksCleared = true;
        }
      });
      if (marksCleared && tr.docChanged) {
        editor.view.dispatch(tr);
      }
    }
    // If current app comments are populated, apply them (handles initial load or new comments after clear)
    // This needs to be more careful to not re-apply if they are already visually there.
    // For now, this logic is simplified and might re-apply. The main Gemini call path is more robust.
    // This useEffect is primarily for the CLEARING. The adding of new comments is handled by callGeminiApi -> onNewCommentsReady.
    // However, if we wanted to *restore* comments from geminiCommentsFromApp (e.g. on load), this is where it might go.
    // For now, let's focus on the clear path.

    prevGeminiCommentsRef.current = geminiCommentsFromApp; // Update ref for next comparison
  }, [editor, geminiCommentsFromApp]);

  const callGeminiApi = async (text: string) => {
    if (!apiKey || text.trim().length === 0 || !editor) return;
    console.log(
      "[callGeminiApi] Calling for text:",
      text.substring(0, 50) + "..."
    );

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
    });
    const prompt = `JSON response of { "comments": [{"exact_quote": "...", "comment": "..."}] } for text: ${text}`;

    try {
      const result = await model.generateContentStream([{ text: prompt }]);
      let streamedResponseText = "";
      for await (const chunk of result.stream) {
        streamedResponseText += chunk.text();
      }
      console.log("[callGeminiApi] Raw:", streamedResponseText);

      const jsonMatch = streamedResponseText.match(/\{.*?\}/s);
      if (!jsonMatch) {
        console.error("No JSON in resp");
        return;
      }
      const jsonString = jsonMatch[0];

      let responseData: GeminiResponse | undefined;
      try {
        responseData = jsoncParse(jsonString) as GeminiResponse;
      } catch (e) {
        console.error("jsoncParse failed:", e);
        return;
      }

      if (!responseData || !responseData.comments) {
        console.error("Parse ok, no comments array");
        return;
      }
      console.log("[callGeminiApi] Parsed:", responseData);

      // At this point, App.tsx will first clear geminiCommentsFromApp (triggering the useEffect above to clear marks),
      // then it will set the new comments from onNewCommentsReady.
      // So, here we just prepare the new comments and let App.tsx handle the state update sequence.

      const newCommentsForApp: Record<string, CommentDetail> = {};
      responseData.comments.forEach((item, index) => {
        if (
          typeof item.exact_quote !== "string" ||
          typeof item.comment !== "string"
        )
          return;
        const commentId = `gemini-${Date.now()}-${index}`;
        newCommentsForApp[commentId] = {
          id: commentId,
          exact_quote: item.exact_quote,
          comment: item.comment,
        };

        // Logic to find and mark text in editor if NOT already marked - this should happen based on geminiCommentsFromApp in useEffect
        // For now, callGeminiApi just focuses on getting the data. The useEffect is responsible for rendering based on geminiCommentsFromApp.
        // To avoid re-applying, the useEffect that adds comments needs to be smart.
      });

      onNewCommentsReady(newCommentsForApp); // Send to App.tsx
    } catch (error) {
      console.error("[callGeminiApi] Outer error:", error);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleContentUpdate = useCallback(
    debounceGeminiSpecific(callGeminiApi, 2000),
    [apiKey, editor, onNewCommentsReady] // Dependencies updated
  );

  // This useEffect is now responsible for applying marks based on geminiCommentsFromApp changes.
  useEffect(() => {
    if (!editor || Object.keys(geminiCommentsFromApp).length === 0) {
      // If no comments from app, ensure nothing is (or remains) highlighted if not already cleared
      // The clearing of marks is handled by the *other* useEffect when geminiCommentsFromApp becomes empty.
      return;
    }

    console.log(
      "[EditorComponent] geminiCommentsFromApp has data. Applying visual marks:",
      geminiCommentsFromApp
    );
    // This loop is for ADDING new marks if they don't exist.
    Object.values(geminiCommentsFromApp).forEach((commentDetail) => {
      const { id: commentId, exact_quote } = commentDetail;
      const textContent = editor.state.doc.textContent;
      let from = -1,
        to = -1,
        searchPos = 0;

      while (searchPos < textContent.length) {
        const currentMatchPos = textContent.indexOf(exact_quote, searchPos);
        if (currentMatchPos === -1) break;
        let isAlreadyMarked = false;

        editor.state.doc.nodesBetween(
          currentMatchPos,
          currentMatchPos + exact_quote.length,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          (node, _) => {
            if (
              node.marks.some(
                (mark) =>
                  mark.type.name === CommentExtension.name &&
                  mark.attrs.commentId === commentId
              )
            ) {
              isAlreadyMarked = true;
              return false;
            }
          }
        );
        if (!isAlreadyMarked) {
          from = currentMatchPos;
          to = currentMatchPos + exact_quote.length;
          console.log(
            `[EditorComponent] Will mark "${exact_quote}" with ID ${commentId}`
          );
          editor
            .chain()
            .setTextSelection({ from, to })
            .setComment(commentId)
            .run();
          break; // Mark only the first uncommented instance
        }
        searchPos = currentMatchPos + exact_quote.length; // Look for next instance if this one was already marked
      }
      if (from === -1) {
        console.warn(
          `[EditorComponent] Did not apply mark for comment ID ${commentId} (quote: "${exact_quote}"). Already marked or not found.`
        );
      }
    });
  }, [editor, geminiCommentsFromApp]);

  return (
    <>
      <EditorContent editor={editor} />
    </>
  );
};

export default EditorComponent;
