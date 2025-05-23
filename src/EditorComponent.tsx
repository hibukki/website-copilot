import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import CommentExtension from "@sereneinserenade/tiptap-comment-extension";
import { useEffect, useCallback, useRef, useState } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { parse as jsoncParse } from "jsonc-parser";
import type { CommentDetail } from "./App";
import MenuBar from "./MenuBar";
import {
  listenToDocumentInFirestore,
  saveDocumentToFirestore,
} from "./firestoreService";

interface EditorComponentProps {
  apiKey: string;
  activeCommentId: string | null;
  setActiveCommentId: (id: string | null) => void;
  onCommentsUpdate: (comments: Record<string, CommentDetail>) => void;
}

function debounceGeminiSpecific(
  func: (text: string) => Promise<void>,
  waitFor: number
): (text: string) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (text: string): void => {
    if (timeout !== null) clearTimeout(timeout);
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
  onCommentsUpdate,
}: EditorComponentProps) => {
  const [internalComments, setInternalComments] = useState<
    Record<string, CommentDetail>
  >({});
  const [apiStatus, setApiStatus] = useState<"idle" | "loading" | "error">(
    "idle"
  );
  const isProgrammaticChangeRef = useRef(false);
  const isFirestoreUpdateRef = useRef(false);
  const editorRef = useRef<Editor | null>(null);

  const callGeminiApi = useCallback(
    async (text: string) => {
      if (!apiKey || text.trim().length === 0 || !editorRef.current) {
        setApiStatus("idle");
        return;
      }
      console.log(
        `[callGeminiApi] Calling for text: ${text.substring(0, 50)}...`
      );
      setApiStatus("loading");

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash-latest",
      });
      const prompt = `Please leave one or more comments in this JSON response structure:

      { 
        "comments": [
            {"exact_quote": "...", "comment": "..."}, 
            {"exact_quote": "...", "comment": "..."}
        ] 
       } 
       
      The text to comment on is:
      <text>
        ${text}
      </text>
      `;

      try {
        const result = await model.generateContentStream([{ text: prompt }]);
        let streamedResponseText = "";
        for await (const chunk of result.stream) {
          streamedResponseText += chunk.text();
        }
        console.log("[callGeminiApi] Raw streamed text:", streamedResponseText);

        let jsonString = "";
        const codeBlockRegex = /```json\n(.*\n)```/s;
        const codeBlockMatch = streamedResponseText.match(codeBlockRegex);

        if (codeBlockMatch && codeBlockMatch[1]) {
          jsonString = codeBlockMatch[1].trim();
          console.log(
            "[callGeminiApi] Extracted JSON from code block:",
            jsonString
          );
        } else {
          // Fallback: find first '{' and last '}'
          const firstBrace = streamedResponseText.indexOf("{");
          const lastBrace = streamedResponseText.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonString = streamedResponseText.substring(
              firstBrace,
              lastBrace + 1
            );
            console.log(
              "[callGeminiApi] Extracted JSON by brace matching:",
              jsonString
            );
          } else {
            console.error("Could not find valid JSON structure in response");
            setApiStatus("error");
            setInternalComments({});
            return;
          }
        }

        let responseData: GeminiResponse | undefined;
        try {
          responseData = jsoncParse(jsonString) as GeminiResponse;
        } catch (e) {
          console.error("jsoncParse failed:", e);
          setApiStatus("error");
          setInternalComments({});
          return;
        }

        if (!responseData || !responseData.comments) {
          console.error("Parse ok, no comments array or invalid structure");
          setApiStatus("error");
          setInternalComments({});
          return;
        }
        console.log("[callGeminiApi] Parsed:", responseData);

        const newCommentsForState: Record<string, CommentDetail> = {};
        responseData.comments.forEach((item, index) => {
          if (
            typeof item.exact_quote !== "string" ||
            typeof item.comment !== "string"
          )
            return;
          const commentId = `gemini-${Date.now()}-${index}`;
          newCommentsForState[commentId] = {
            id: commentId,
            exact_quote: item.exact_quote,
            comment: item.comment,
          };
        });
        setInternalComments(newCommentsForState);
        setApiStatus("idle");
      } catch (error) {
        console.error("[callGeminiApi] Outer error:", error);
        setApiStatus("error");
        setInternalComments({});
      }
    },
    [apiKey]
  );

  const handleContentUpdateForGemini = useCallback(
    debounceGeminiSpecific(callGeminiApi, 2000),
    [callGeminiApi]
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      CommentExtension.configure({
        HTMLAttributes: { class: "my-comment" },
        onCommentActivated: setActiveCommentId,
      }),
    ],
    content: "<p>Loading content from Firestore...</p>",
    onUpdate: ({ editor: currentEditor }: { editor: Editor }) => {
      editorRef.current = currentEditor;

      if (isFirestoreUpdateRef.current) {
        isFirestoreUpdateRef.current = false;
        return;
      }
      if (isProgrammaticChangeRef.current) {
        isProgrammaticChangeRef.current = false;
        return;
      }

      const jsonContent = currentEditor.getJSON();
      saveDocumentToFirestore(jsonContent);

      const currentText = currentEditor.getText();
      if (apiKey && currentText.trim().length > 0) {
        handleContentUpdateForGemini(currentText);
      } else if (!apiKey || currentText.trim().length === 0) {
        setApiStatus("idle");
      }
    },
  });

  useEffect(() => {
    if (editor) {
      editorRef.current = editor;
    }
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    console.log("[EditorComponent] Setting up Firestore listener...");
    const unsubscribe = listenToDocumentInFirestore((content) => {
      if (editor && content) {
        console.log(
          "[EditorComponent] Firestore data received, updating editor."
        );
        isFirestoreUpdateRef.current = true;
        if (JSON.stringify(editor.getJSON()) !== JSON.stringify(content)) {
          editor.commands.setContent(content, false);
        } else {
          console.log(
            "[EditorComponent] Firestore data same as current editor, skipping setContent."
          );
          isFirestoreUpdateRef.current = false;
        }
      } else if (editor && content === null) {
        console.log(
          "[EditorComponent] Firestore document deleted or does not exist, clearing editor."
        );
        isFirestoreUpdateRef.current = true;
        editor.commands.setContent(
          "<p>Start typing a new document...</p>",
          false
        );
      }
    });

    return () => {
      console.log("[EditorComponent] Unsubscribing from Firestore listener.");
      unsubscribe();
    };
  }, [editor]);

  useEffect(() => {
    onCommentsUpdate(internalComments);
  }, [internalComments, onCommentsUpdate]);

  useEffect(() => {
    if (!editor) return;
    if (Object.keys(internalComments).length === 0 && apiStatus !== "loading") {
      console.log(
        "[EditorComponent] internalComments is empty & not loading. Clearing visual marks."
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
        isProgrammaticChangeRef.current = true;
        editor.view.dispatch(tr);
      }
    }
  }, [editor, internalComments, apiStatus]);

  // Effect to apply visual comment marks based on internalComments
  useEffect(() => {
    if (!editor) return;

    // 1. Clear ALL existing Tiptap comment marks first
    // This ensures that if a comment ID is no longer in internalComments, its mark is removed.
    console.log(
      "[EditorComponent] Clearing existing comment marks before applying new ones."
    );
    const trClear = editor.state.tr;
    let oldMarksCleared = false;
    editor.state.doc.descendants((node, pos) => {
      if (node.marks.some((mark) => mark.type.name === CommentExtension.name)) {
        // Ensure we are removing the correct mark type instance from the schema
        const commentMarkType = editor.schema.marks[CommentExtension.name];
        if (commentMarkType) {
          trClear.removeMark(pos, pos + node.nodeSize, commentMarkType);
          oldMarksCleared = true;
        }
      }
    });

    if (oldMarksCleared && trClear.docChanged) {
      isProgrammaticChangeRef.current = true; // Prevent this clear from triggering onUpdate->save/Gemini
      editor.view.dispatch(trClear);
      console.log(
        "[EditorComponent] Dispatched transaction to clear old marks."
      );
    }

    // 2. If there are no new comments to apply, we're done.
    if (Object.keys(internalComments).length === 0) {
      console.log(
        "[EditorComponent] No new internal comments to apply after clearing."
      );
      return;
    }

    // 3. Apply new marks
    // If a clear operation was dispatched, the editor state will update asynchronously.
    // Applying new marks immediately might be on stale document state if not careful.
    // However, Tiptap transactions are generally applied synchronously to the state object
    // before view dispatch. For robustness, one could use a timeout or await next tick
    // if clearDispatched, but let's try direct application first.

    console.log(
      `[EditorComponent] Applying visual marks for ${
        Object.keys(internalComments).length
      } new comments.`
    );
    Object.values(internalComments).forEach((commentDetail) => {
      const { id: commentId, exact_quote } = commentDetail;
      if (!exact_quote) return;

      console.log(
        `[EditorComponent] Searching for quote: |${exact_quote}| (ID: ${commentId})`
      );

      const textContent = editor.state.doc.textContent;
      let searchPos = 0;
      let firstUnmarkedFound = false;

      while (searchPos < textContent.length && !firstUnmarkedFound) {
        console.log(
          `[EditorComponent] Attempting indexOf at searchPos: ${searchPos}`
        );
        const currentMatchPos = textContent.indexOf(exact_quote, searchPos);
        console.log(
          `[EditorComponent] indexOf result for "${exact_quote}": ${currentMatchPos}`
        );

        if (currentMatchPos === -1) {
          console.log(
            `[EditorComponent] Quote not found after pos ${searchPos}.`
          );
          if (searchPos > 0 && searchPos < textContent.length - 1) {
            const contextSnippetLength = Math.max(20, exact_quote.length + 10);
            const startContext = Math.max(
              0,
              searchPos - contextSnippetLength / 2
            );
            const endContext = Math.min(
              textContent.length,
              searchPos + contextSnippetLength / 2
            );
            console.log(
              `[EditorComponent] Context around last good searchPos (${searchPos}): "${textContent.substring(
                startContext,
                endContext
              )}"`
            );
          }
          break;
        }

        let isAlreadyMarked = false;
        editor.state.doc.nodesBetween(
          currentMatchPos,
          currentMatchPos + exact_quote.length,
          (node) => {
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
          console.log(
            `[EditorComponent] Will mark "${exact_quote}" with ID ${commentId} from ${currentMatchPos} to ${
              currentMatchPos + exact_quote.length
            }`
          );
          isProgrammaticChangeRef.current = true;
          editor
            .chain()
            .setTextSelection({
              from: currentMatchPos,
              to: currentMatchPos + exact_quote.length,
            })
            .setComment(commentId)
            .run();
          firstUnmarkedFound = true;
        } else {
          console.log(
            `[EditorComponent] Quote "${exact_quote}" (ID: ${commentId}) at pos ${currentMatchPos} is already marked. Continuing search.`
          );
        }
        searchPos = currentMatchPos + exact_quote.length;
      }
    });
  }, [editor, internalComments]);

  return (
    <>
      {editor && <MenuBar editor={editor} />}
      <EditorContent editor={editor} />
      <div
        style={{
          fontSize: "0.8em",
          color: "#888",
          marginTop: "8px",
          height: "20px",
        }}
      >
        {apiStatus === "loading" && "Fetching comments..."}
        {apiStatus === "error" && "Error fetching comments."}
        {apiStatus === "idle" &&
          Object.keys(internalComments).length > 0 &&
          "Comments loaded."}
        {apiStatus === "idle" &&
          Object.keys(internalComments).length === 0 &&
          "Ready."}
      </div>
    </>
  );
};

export default EditorComponent;
