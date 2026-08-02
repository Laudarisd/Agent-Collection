// Chat input composer: multiline prompt box with keyboard send behavior.
// ========================
// Imports
// ========================
import { useEffect, useRef, useState } from "react";

import "../styles/PromptInput.css";

export default function PromptInput({ onSubmit, disabled, onDraftChange, compact = false }) {
  // ========================
  // Local state
  // ========================
  // Local textarea state while user types.
  const [value, setValue] = useState("");
  // Direct textarea reference for persistent typing focus.
  const textareaRef = useRef(null);

  useEffect(() => {
    // Keep input focused whenever submit lock is lifted.
    if (!disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled]);

  // ========================
  // Handlers
  // ========================
  async function handleSubmit(event) {
    event.preventDefault();
    // Ignore empty prompt and blocked submit states.
    const trimmed = value.trim();
    if (!trimmed || disabled) {
      return;
    }
    await onSubmit(trimmed);
    // Reset local + parent draft after successful send.
    setValue("");
    onDraftChange?.("");
    textareaRef.current?.focus();
  }

  async function handleKeyDown(event) {
    // Enter sends, Shift+Enter keeps newline behavior.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const trimmed = value.trim();
      if (!trimmed || disabled) {
        return;
      }
      await onSubmit(trimmed);
      setValue("");
      onDraftChange?.("");
      textareaRef.current?.focus();
    }
  }

  // ========================
  // Render
  // ========================
  return (
    <div className={`prompt-shell ${compact ? "prompt-shell--compact" : ""}`}>
      {/* Expanded header is shown only in non-compact mode. */}
      {!compact ? (
        <div className="prompt-header">
          <div>
            <h3>Prompt Composer</h3>
          </div>
        </div>
      ) : null}

      <form className="prompt-form" onSubmit={handleSubmit}>
        {/* Multiline prompt input field. */}
        <textarea
          ref={textareaRef}
          placeholder="Type your prompt..."
          rows={compact ? 3 : 5}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            onDraftChange?.(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />

        <div className="prompt-footer">
          {/* Keyboard shortcut helper text. */}
          <div className="prompt-tools">
            <span className="hint">Enter to send, Shift + Enter for newline</span>
          </div>
          {/* Primary send action. */}
          <div className="prompt-actions">
            <button type="submit" className="primary-button" disabled={disabled}>
              Send to agent
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
