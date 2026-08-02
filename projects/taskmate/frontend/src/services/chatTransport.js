// Chat transport layer: central place for prompt send/receive flow.
// ========================
// Imports
// ========================
import { createPrompt, getPromptHistory } from "./api.js";

// ========================
// Prompt transport
// ========================
export async function submitPromptToBackend({ prompt, sessionId }) {
  // Sends one prompt payload to backend prompt endpoint.
  return createPrompt({ prompt, session_id: sessionId });
}

// ========================
// History transport
// ========================
export async function fetchSessionPrompts(sessionId) {
  // Fetches conversation history for one selected session.
  return getPromptHistory(sessionId);
}
