import React from "react";
import type { CommentDetail } from "./App"; // Import CommentDetail

interface CommentSidebarProps {
  comments: Record<string, CommentDetail>; // Expecting full detail
  activeCommentId: string | null;
  setActiveCommentId: (id: string | null) => void;
  // We might need a function here to tell the editor to focus/scroll to a comment
  // focusCommentInEditor: (commentId: string) => void;
}

const CommentSidebar: React.FC<CommentSidebarProps> = ({
  comments,
  activeCommentId,
  setActiveCommentId,
}) => {
  if (Object.keys(comments).length === 0) {
    return <p>No comments yet. Type in the editor to get suggestions!</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <h3>Comments</h3>
      {Object.values(comments).map(
        (
          commentDetail // Iterate Object.values
        ) => (
          <div
            key={commentDetail.id}
            onClick={() => setActiveCommentId(commentDetail.id)}
            style={{
              padding: "8px",
              border: `1px solid ${
                activeCommentId === commentDetail.id ? "blue" : "#ccc"
              }`,
              borderRadius: "4px",
              cursor: "pointer",
              backgroundColor:
                activeCommentId === commentDetail.id
                  ? "rgba(0, 100, 255, 0.1)"
                  : "transparent",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "0.8em",
                fontStyle: "italic",
                color: "#777",
              }}
            >
              For: "
              <em>
                {commentDetail.exact_quote.length > 50
                  ? commentDetail.exact_quote.substring(0, 47) + "..."
                  : commentDetail.exact_quote}
              </em>
              "
            </p>
            <p
              style={{
                margin: "5px 0 0 0",
                fontSize: "0.9em",
                whiteSpace: "pre-wrap",
              }}
            >
              {commentDetail.comment}
            </p>
          </div>
        )
      )}
    </div>
  );
};

export default CommentSidebar;
