import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders the main heading", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", {
        name: /Tiptap Editor with Gemini Comments/i,
      })
    ).toBeInTheDocument();
  });

  it("renders the Tiptap editor", () => {
    render(<App />);
    expect(screen.getByRole("textbox")).toBeInTheDocument(); // Tiptap editor is a textbox role
  });
});
