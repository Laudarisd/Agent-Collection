// Main authenticated workspace: threads, chat panel, tool activity panel, and data loading.
// ========================
// Imports
// ========================
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import History from "../components/History.jsx";
import PromptInput from "../components/PromptInput.jsx";
import ResponseDisplay from "../components/ResponseDisplay.jsx";
import "../styles/ChatPage.css";
import {
  clearAllSessions,
  createSession,
  deleteSession,
  getSessions,
  renameSession,
} from "../services/api.js";
import { fetchSessionPrompts, submitPromptToBackend } from "../services/chatTransport.js";

export default function ChatPage({ user, authLoading }) {
  // ========================
  // State
  // ========================
  // Sidebar thread/session objects.
  const [sessions, setSessions] = useState([]);
  // Currently selected thread id.
  const [activeSessionId, setActiveSessionId] = useState(null);
  // Inline page-level error display.
  const [error, setError] = useState("");
  // Submit lock to avoid double-send.
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ========================
  // Helpers
  // ========================
  // Normalizes backend session payload to frontend display shape.
  function toFrontendSession(rawSession, items = []) {
    return {
      id: rawSession.id,
      title: rawSession.title,
      items,
      updatedAt: rawSession.updated_at || items.at(-1)?.created_at || new Date().toISOString(),
    };
  }

  // ========================
  // Effects: sessions bootstrap
  // ========================
  useEffect(() => {
    // Initial load for session sidebar when auth user changes.
    async function loadSessionsAndHistory() {
      setError("");
      if (!user) {
        setSessions([]);
        setActiveSessionId(null);
        return;
      }
      try {
        const existingSessions = await getSessions();
        const mappedSessions = existingSessions.map((session) => toFrontendSession(session, []));
        // Start in a blank chat surface; user can pick history or send a new prompt.
        setSessions(mappedSessions);
        setActiveSessionId(null);
      } catch (err) {
        setError(err.message || "Failed to load history");
      }
    }
    loadSessionsAndHistory();
  }, [user]);

  // ========================
  // Effects: selected session history
  // ========================
  useEffect(() => {
    // Load message history for selected thread.
    async function loadSessionPrompts() {
      setError("");
      if (!user) {
        return;
      }
      if (!activeSessionId) {
        return;
      }
      try {
        const rows = await fetchSessionPrompts(activeSessionId);
        // Replace only selected session message list.
        setSessions((prev) =>
          prev.map((session) =>
            session.id === activeSessionId
              ? {
                  ...session,
                  items: rows,
                  updatedAt: rows.at(-1)?.created_at || session.updatedAt,
                }
              : session
          )
        );
      } catch (err) {
        setError(err.message || "Failed to load session messages");
      }
    }
    loadSessionPrompts();
  }, [activeSessionId, user]);

  // ========================
  // Actions: prompt + sessions
  // ========================
  async function handlePromptSubmit(promptText) {
    setError("");
    setIsSubmitting(true);
    let sessionId = activeSessionId;
    const optimisticId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      // Auto-create a session if user sends prompt on blank screen.
      if (!sessionId) {
        const fallback = await createSession(`Session ${sessions.length + 1}`);
        const fallbackSession = toFrontendSession(fallback, []);
        setSessions((prev) => [fallbackSession, ...prev]);
        setActiveSessionId(fallbackSession.id);
        sessionId = fallbackSession.id;
      }

      // Add user message instantly and show assistant typing state.
      const optimisticRow = {
        id: optimisticId,
        user_id: user.id,
        session_id: sessionId,
        prompt_text: promptText,
        response_text: null,
        status: "processing",
        created_at: new Date().toISOString(),
        _pending: true,
      };
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                items: [...session.items, optimisticRow],
                updatedAt: optimisticRow.created_at,
              }
            : session
        )
      );

      const row = await submitPromptToBackend({ prompt: promptText, sessionId });
      // Push message into matching session card and refresh timestamp.
      setSessions((prev) => {
        let found = false;
        const next = prev.map((session) => {
          if (session.id !== sessionId) {
            return session;
          }
          found = true;
          const replaced = session.items.map((item) => (item.id === optimisticId ? row : item));
          const hasReplacement = replaced.some((item) => item.id === row.id);
          return {
            ...session,
            items: hasReplacement ? replaced : [...replaced, row],
            updatedAt: row.created_at,
          };
        });

        if (!found) {
          // Safety fallback if list and active session get out of sync.
          next.unshift({
            id: sessionId,
            title: `Session ${next.length + 1}`,
            items: [row],
            updatedAt: row.created_at,
          });
        }
        return next;
      });
    } catch (err) {
      // Convert pending bubble into a visible failed response.
      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== sessionId) {
            return session;
          }
          return {
            ...session,
            items: session.items.map((item) =>
              item.id === optimisticId
                ? {
                    ...item,
                    _pending: false,
                    status: "failed",
                    response_text: "Request failed. Please retry.",
                  }
                : item
            ),
          };
        })
      );
      setError(err.message || "Failed to save prompt");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Create a blank session and switch focus to it.
  async function handleNewSession() {
    try {
      // Names are sequential for quick visual ordering.
      const nextName = `Session ${sessions.length + 1}`;
      const row = await createSession(nextName);
      const nextSession = toFrontendSession(row, []);
      setSessions((prev) => [nextSession, ...prev]);
      setActiveSessionId(nextSession.id);
    } catch (err) {
      setError(err.message || "Failed to create session");
    }
  }

  // Rename one existing session.
  async function handleRenameSession(sessionId, title) {
    try {
      // Persist rename in backend and mirror local title.
      const row = await renameSession(sessionId, title);
      setSessions((prev) =>
        prev.map((session) => (session.id === sessionId ? { ...session, title: row.title } : session))
      );
    } catch (err) {
      setError(err.message || "Failed to rename session");
    }
  }

  // Hide one session from current user view.
  async function handleDeleteSession(sessionId) {
    try {
      // Soft-delete session from user view (backend retains records).
      await deleteSession(sessionId);
      const nextSessions = sessions.filter((session) => session.id !== sessionId);
      setSessions(nextSessions);

      if (!nextSessions.length) {
        // Keep chat usable after deleting the last visible session.
        const fallback = await createSession("Session 1");
        const fallbackSession = toFrontendSession(fallback, []);
        setSessions([fallbackSession]);
        setActiveSessionId(fallbackSession.id);
        return;
      }

      if (activeSessionId === sessionId) {
        setActiveSessionId(nextSessions[0].id);
      }
    } catch (err) {
      setError(err.message || "Failed to delete session");
    }
  }

  // Hide all sessions from current user view.
  async function handleDeleteAllSessions() {
    if (!sessions.length) {
      return;
    }
    if (!window.confirm("Delete all sessions from this page? Data will remain stored in backend.")) {
      return;
    }
    try {
      // Bulk-hide all sessions for current user.
      await clearAllSessions();
      setSessions([]);
      setActiveSessionId(null);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to clear sessions");
    }
  }

  // ========================
  // Derived UI values
  // ========================
  const activeSession = sessions.find((session) => session.id === activeSessionId) || null;

  // ========================
  // Route guards
  // ========================
  if (authLoading) {
    // Prevent flashing login-required while token check is running.
    return <main className="content-page"><p>Checking your session...</p></main>;
  }

  if (!user) {
    // Guard route for anonymous visitors.
    return (
      <main className="content-page login-required-page">
        <h2>Login required</h2>
        <p>Please log in to save prompts with your account identity.</p>
        <Link className="primary-button" to="/login">
          Go to login
        </Link>
      </main>
    );
  }

  // ========================
  // Render
  // ========================
  return (
    <main className="chat-workspace chat-workspace--no-tools">
      {/* Left column: thread/session management. */}
      <section className="panel-column panel-column--history">
        <History
          items={sessions}
          selectedId={activeSessionId}
          onSelect={(sessionId) => setActiveSessionId(sessionId)}
          onNewSession={handleNewSession}
          onDeleteAllSessions={handleDeleteAllSessions}
          onRenameSession={handleRenameSession}
          onDeleteSession={handleDeleteSession}
        />
      </section>

      {/* Middle column: active conversation and composer. */}
      <section className="panel-column panel-column--chat">
        {error ? <p className="error-text">{error}</p> : null}
        <div className="chat-notice">
          TaskMate can make mistakes, check before adopting answer.
        </div>
        <div className="chat-feed">
          <ResponseDisplay messages={activeSession?.items || []} />
        </div>
        <div className="chat-input-dock">
          <PromptInput
            onSubmit={handlePromptSubmit}
            disabled={isSubmitting}
            compact
          />
        </div>
      </section>
    </main>
  );
}
