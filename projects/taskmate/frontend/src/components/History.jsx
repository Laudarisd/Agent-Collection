// Thread sidebar: session list, select, rename, delete, and delete-all actions.
// ========================
// Imports
// ========================
import "../styles/History.css";
import { useState } from "react";

function formatDate(value) {
  // Render local datetime for human-friendly sidebar timestamps.
  return new Date(value).toLocaleString();
}

export default function History({
  items = [],
  onSelect,
  selectedId,
  onNewSession,
  onDeleteAllSessions,
  onRenameSession,
  onDeleteSession,
}) {
  // ========================
  // Local UI state
  // ========================
  // Tracks which thread action menu is currently open.
  const [openMenuId, setOpenMenuId] = useState(null);

  // Keep newest sessions first by updated timestamp.
  const sortedItems = [...items].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  // ========================
  // Render
  // ========================
  return (
    <section className="history-panel">
      <div className="history-header">
        {/* Sidebar title block. */}
        <h3>Threads</h3>
      </div>
      <div className="history-actions">
        {/* Create a new session/thread. */}
        <button type="button" className="ghost-button history-new-button" onClick={onNewSession}>
          New Session
        </button>
        {/* Hide all sessions from user view in one action. */}
        <button
          type="button"
          className="ghost-button history-delete-all-button"
          onClick={onDeleteAllSessions}
          disabled={!items.length}
        >
          Delete All
        </button>
      </div>

      <div className="history-list">
        {items.length === 0 ? (
          <p>No sessions yet.</p>
        ) : (
          // Render one card per session.
          sortedItems.map((item) => (
            <article
              className={`history-card ${selectedId === item.id ? "history-card--active" : ""}`}
              key={item.id}
              onClick={() => {
                setOpenMenuId(null);
                onSelect(item.id);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setOpenMenuId(null);
                  onSelect(item.id);
                }
              }}
            >
              <div className="history-card-top">
                <h4>{item.title}</h4>
                <div className="thread-menu" onClick={(event) => event.stopPropagation()}>
                  {/* Vertical menu trigger for per-thread actions. */}
                  <button
                    type="button"
                    className="thread-menu-trigger"
                    aria-label="Thread actions"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenMenuId((prev) => (prev === item.id ? null : item.id));
                    }}
                  >
                    ⋮
                  </button>
                  {openMenuId === item.id ? (
                    <div className="thread-menu-list">
                      {/* Rename only changes title, keeps same session id. */}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          const nextTitle = window.prompt("Rename session", item.title);
                          if (nextTitle && nextTitle.trim()) {
                            onRenameSession(item.id, nextTitle.trim());
                          }
                          setOpenMenuId(null);
                        }}
                      >
                        Rename
                      </button>
                      {/* Delete hides this full session from user view. */}
                      <button
                        type="button"
                        className="danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (window.confirm("Delete this session?")) {
                            onDeleteSession(item.id);
                          }
                          setOpenMenuId(null);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <p>{item.items.length} messages</p>
              <p>{formatDate(item.updatedAt)}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
