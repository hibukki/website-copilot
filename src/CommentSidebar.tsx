import React from "react";

interface CommentSidebarProps {
  comments: Record<string, string>; // Maps commentId to comment text
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
      {Object.entries(comments).map(([commentId, commentText]) => (
        <div
          key={commentId}
          onClick={() => setActiveCommentId(commentId)} // Set this comment as active
          style={{
            padding: "8px",
            border: `1px solid ${
              activeCommentId === commentId ? "blue" : "#ccc"
            }`,
            borderRadius: "4px",
            cursor: "pointer",
            backgroundColor:
              activeCommentId === commentId
                ? "rgba(0, 100, 255, 0.1)"
                : "transparent",
          }}
        >
          <p style={{ margin: 0, fontSize: "0.9em", whiteSpace: "pre-wrap" }}>
            {commentText}
          </p>
          {/* <small>ID: {commentId}</small> */}
        </div>
      ))}
    </div>
  );
};

export default CommentSidebar;
