import "./App.css";
import EditorComponent from "./EditorComponent";
import { useState } from "react";

function App() {
  const [apiKey, setApiKey] = useState<string>("");

  return (
    <>
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
      <EditorComponent apiKey={apiKey} />
    </>
  );
}

export default App;
