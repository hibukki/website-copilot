import "./App.css";
import EditorComponent from "./EditorComponent";
import { useState, useEffect } from "react";
import CommentSidebar from "./CommentSidebar"; // Uncommented

const API_KEY_STORAGE_KEY = "geminiApiKey";

function App() {
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || "";
  });

  // State lifted from EditorComponent
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [geminiComments, setGeminiComments] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    } else {
      // Optionally, remove the key if it's cleared
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      // If API key is cleared, also clear comments
      setGeminiComments({});
      setActiveCommentId(null);
    }
  }, [apiKey]);

  // Callback for EditorComponent to update comments
  const handleNewComments = (newComments: Record<string, string>) => {
    // This will replace all previous comments with the new set from Gemini
    setGeminiComments(newComments);
    // Optionally, if you want to keep the active comment if it still exists in newComments:
    // if (activeCommentId && !newComments[activeCommentId]) {
    //   setActiveCommentId(null);
    // }
  };

  // Callback for EditorComponent to signal clearing comments
  // The actual editor mark clearing needs to be handled carefully.
  // For now, this primarily resets the App state.
  // EditorComponent will need a way to react to this if we want to clear marks from App.
  const handleClearExistingComments = () => {
    console.log(
      "[App] handleClearExistingComments called. Clearing geminiComments state."
    );
    setGeminiComments({});
    setActiveCommentId(null);
    // How to trigger editor.commands.unsetComment for all existing comments from here?
    // This is the tricky part. Tiptap editor instance is not directly accessible here.
    // We might need to pass a ref or a trigger mechanism down to EditorComponent.
    // For now, this clears the state that would populate the sidebar.
    // The EditorComponent itself will not re-apply old marks it doesn't know about.
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
      <div
        style={{
          display: "flex",
          flexGrow: 1,
          overflow: "hidden" /* Prevent page scroll */,
        }}
      >
        <div
          style={{
            flexGrow: 3,
            marginRight: "1rem",
            border: "1px solid #555",
            padding: "0.5rem",
            overflowY: "auto" /* Scroll editor if needed */,
          }}
        >
          <EditorComponent
            apiKey={apiKey}
            activeCommentId={activeCommentId}
            setActiveCommentId={setActiveCommentId}
            geminiComments={geminiComments}
            onNewComments={handleNewComments}
            clearExistingComments={handleClearExistingComments}
          />
        </div>
        <div
          style={{
            flexGrow: 1,
            border: "1px solid #555",
            padding: "1rem",
            overflowY: "auto" /* Scroll sidebar if needed */,
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
