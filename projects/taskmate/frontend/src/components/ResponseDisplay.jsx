// Chat transcript renderer: user and assistant messages for active session.
// ========================
// Imports
// ========================
import { Fragment, useEffect, useRef } from "react";

import "../styles/ResponseDisplay.css";

export default function ResponseDisplay({ messages = [] }) {
  // Keep scroll pinned to latest message as new items arrive.
  const streamRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (!endRef.current || !streamRef.current) {
      return;
    }
    endRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // ========================
  // Empty state
  // ========================
  // Empty-state panel before first prompt in selected/new session.
  if (!messages.length) {
    return (
      <div className="response-panel">
        <p>Start the conversation by sending your first prompt.</p>
      </div>
    );
  }

  // ========================
  // Render
  // ========================
  return (
    <div className="response-panel">
      {/* Scrollable message stream for active thread. */}
      <div className="message-stream" ref={streamRef}>
        {/* Each prompt row is rendered as User + Assistant pair. */}
        {messages.map((prompt) => (
          <Fragment key={prompt.id}>
            <article className="message message--user">
              <div className="message-meta">You</div>
              <p>{prompt.prompt_text}</p>
            </article>
            {prompt._pending || prompt.status === "processing" ? (
              <article className="message message--assistant message--typing">
                <div>
                  <div className="message-meta">TaskMate</div>
                  <p>Thinking...</p>
                </div>
                <span className="typing-indicator" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </article>
            ) : (
              <article className="message message--assistant">
                <div className="message-meta">TaskMate</div>
                <p>{prompt.response_text || "No model output yet."}</p>
              </article>
            )}
          </Fragment>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
