import "./App.css";
import EditorComponent from "./EditorComponent";
import { useState, useEffect } from "react";
import CommentSidebar from "./CommentSidebar";

const API_KEY_STORAGE_KEY = "geminiApiKey";

// New type for storing full comment details
export interface CommentDetail {
  id: string; // This will be the key in the Record
  exact_quote: string;
  comment: string;
}

function App() {
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || "";
  });

  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  // geminiComments now stores { commentId: { id, exact_quote, comment } }
  // No, simpler: App will store Record<string, { exact_quote: string, comment: string }>
  // The onNewCommentsReady in EditorComponent will create this structure.
  const [geminiComments, setGeminiComments] = useState<
    Record<string, CommentDetail>
  >({});

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      setGeminiComments({});
      setActiveCommentId(null);
    }
  }, [apiKey]);

  // Called by EditorComponent when new comments are ready from Gemini API
  const handleNewCommentsReady = (
    newComments: Record<string, CommentDetail>
  ) => {
    console.log(
      "[App] Clearing comments and preparing to set new ones:",
      newComments
    );
    setGeminiComments({});
    setActiveCommentId(null);

    setTimeout(() => {
      console.log("[App] Setting new comments after delay:", newComments);
      setGeminiComments(newComments);
    }, 50);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <h1>Tiptap Editor with Gemini Comments</h1>
      <div>
        <label htmlFor="apiKey">Gemini API Key: </label>
        <input
          type="text"
          id="apiKey"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your Gemini API Key"
          style={{ marginBottom: "1rem", width: "300px" }}
        />
      </div>
      <div style={{ display: "flex", flexGrow: 1, overflow: "hidden" }}>
        <div
          style={{
            flexBasis: "70%",
            marginRight: "1rem",
            border: "1px solid #555",
            padding: "0.5rem",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <EditorComponent
            apiKey={apiKey}
            activeCommentId={activeCommentId}
            setActiveCommentId={setActiveCommentId}
            geminiCommentsFromApp={geminiComments}
            onNewCommentsReady={handleNewCommentsReady}
          />
        </div>
        <div
          style={{
            flexBasis: "30%",
            border: "1px solid #555",
            padding: "1rem",
            overflowY: "auto",
          }}
        >
          <CommentSidebar
            comments={geminiComments}
            activeCommentId={activeCommentId}
            setActiveCommentId={setActiveCommentId}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
