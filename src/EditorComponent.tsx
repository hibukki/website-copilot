import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import CommentExtension from "@sereneinserenade/tiptap-comment-extension";
import { useEffect, useCallback, useRef, useState } from "react";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { parse as jsoncParse } from "jsonc-parser";
import type { CommentDetail } from "./App";

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
  const isProgrammaticChangeRef = useRef(false);
  const editorRef = useRef<Editor | null>(null); // Typed Editor or null

  const callGeminiApi = useCallback(
    async (text: string) => {
      if (!apiKey || text.trim().length === 0 || !editorRef.current) return;
      console.log(
        `[callGeminiApi] Calling for text: ${text.substring(0, 50)}...`
      );

      setInternalComments({}); // Clear previous comments

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash-latest",
      });
      const prompt = `Please leave one or more comments in this JSON response structure: { "comments": [{"exact_quote": "...", "comment": "..."}, {"exact_quote": "...", "comment": "..."}] } for text: ${text}`;

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
      } catch (error) {
        console.error("[callGeminiApi] Outer error:", error);
        setInternalComments({});
      }
    },
    [apiKey /* editorRef is stable, setInternalComments is stable */]
  );

  const handleContentUpdate = useCallback(
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
    content: "<p>Start typing here and Gemini will try to add comments...</p>",
    onUpdate: ({ editor: currentEditor }: { editor: Editor }) => {
      editorRef.current = currentEditor;
      if (isProgrammaticChangeRef.current) {
        isProgrammaticChangeRef.current = false;
        return;
      }
      const currentText = currentEditor.getText();
      if (apiKey && currentText.trim().length > 0) {
        handleContentUpdate(currentText);
      }
    },
  });

  // Effect to assign editor to ref once it's initialized
  useEffect(() => {
    if (editor) {
      editorRef.current = editor;
    }
  }, [editor]);

  useEffect(() => {
    onCommentsUpdate(internalComments);
  }, [internalComments, onCommentsUpdate]);

  useEffect(() => {
    if (!editor) return;
    if (Object.keys(internalComments).length === 0) {
      console.log(
        "[EditorComponent] internalComments is empty. Clearing visual marks."
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
  }, [editor, internalComments]);

  useEffect(() => {
    if (!editor || Object.keys(internalComments).length === 0) return;
    console.log(
      `[EditorComponent] Applying visual marks for ${
        Object.keys(internalComments).length
      } comments.`
    );
    Object.values(internalComments).forEach((commentDetail) => {
      const { id: commentId, exact_quote } = commentDetail;
      if (!exact_quote) return;
      const textContent = editor.state.doc.textContent;
      let searchPos = 0;
      let firstUnmarkedFound = false;
      while (searchPos < textContent.length && !firstUnmarkedFound) {
        const currentMatchPos = textContent.indexOf(exact_quote, searchPos);
        if (currentMatchPos === -1) break;
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
            `[EditorComponent] Will mark "${exact_quote}" with ID ${commentId} at pos ${currentMatchPos}`
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
        }
        searchPos = currentMatchPos + exact_quote.length;
      }
    });
  }, [editor, internalComments]);

  return <EditorContent editor={editor} />;
};

export default EditorComponent;
