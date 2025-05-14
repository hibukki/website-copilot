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
  // NEW state for comments to be displayed in the sidebar, updated by EditorComponent
  const [displayedComments, setDisplayedComments] = useState<
    Record<string, CommentDetail>
  >({});

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      // When API key is removed, also clear displayed comments and active selection
      setDisplayedComments({});
      setActiveCommentId(null);
    }
  }, [apiKey]);

  // Called by EditorComponent when its internal comments state changes
  const handleCommentsUpdate = (newComments: Record<string, CommentDetail>) => {
    console.log(
      "[App] Received comments update from EditorComponent:",
      newComments
    );
    setDisplayedComments(newComments);
    // If the active comment is no longer in the new set, clear it
    if (activeCommentId && !newComments[activeCommentId]) {
      setActiveCommentId(null);
    }
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
            onCommentsUpdate={handleCommentsUpdate} // Pass the new handler
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
            comments={displayedComments} // Pass the new state
            activeCommentId={activeCommentId}
            setActiveCommentId={setActiveCommentId}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
