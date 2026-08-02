// Frontend API client: auth/session/prompt/admin requests and token storage.
// ========================
// Constants
// ========================
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const TOKEN_KEY = "taskmate_token";

// ========================
// Core helpers
// ========================
function getHeaders(includeAuth = true) {
  // Default JSON headers used by all API calls.
  const headers = {
    "Content-Type": "application/json",
  };
  if (includeAuth) {
    // Attach bearer token when request requires authentication.
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  return headers;
}

async function request(path, options = {}) {
  // Shared request wrapper for consistent headers/error handling.
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...getHeaders(options.includeAuth !== false),
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get("content-type") || "";
  // Support JSON payloads and plain-text fallback errors.
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    // Normalize backend errors into throw-friendly Error instances.
    const detail = typeof payload === "object" && payload?.detail ? payload.detail : "Request failed";
    throw new Error(detail);
  }

  return payload;
}

// ========================
// Token helpers
// ========================
export function saveToken(token) {
  // Persist token for page refresh continuity.
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  // Logout helper to remove session token.
  localStorage.removeItem(TOKEN_KEY);
}

export function hasToken() {
  // Used during app bootstrap before calling /auth/me.
  return Boolean(localStorage.getItem(TOKEN_KEY));
}

// ========================
// Auth API
// ========================
export async function registerUser({ name, email, password }) {
  // Register new account and immediately store returned token.
  const data = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
    includeAuth: false,
  });
  saveToken(data.token);
  return data.user;
}

export async function loginUser({ email, password }) {
  // Login existing account and immediately store returned token.
  const data = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    includeAuth: false,
  });
  saveToken(data.token);
  return data.user;
}

export async function getCurrentUser() {
  // Validate token and fetch current authenticated user profile.
  return request("/api/auth/me", {
    method: "GET",
  });
}

// ========================
// Prompt API
// ========================
export async function createPrompt(prompt) {
  // Create one prompt entry tied to session_id.
  return request("/api/prompts", {
    method: "POST",
    body: JSON.stringify(prompt),
  });
}

export async function getPromptHistory(sessionId) {
  // Fetch prompt history by selected session; empty returns all visible.
  const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
  return request(`/api/prompts/history${query}`, {
    method: "GET",
  });
}

// ========================
// Session API
// ========================
export async function getSessions() {
  // Load visible session list for authenticated user.
  return request("/api/sessions", {
    method: "GET",
  });
}

export async function createSession(title = "New Session") {
  // Create a new session/thread with a default title.
  return request("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function renameSession(sessionId, title) {
  // Update session title by id.
  return request(`/api/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function deleteSession(sessionId) {
  // Hide one session from user view (soft delete backend-side).
  return request(`/api/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export async function clearAllSessions() {
  // Hide all sessions from user view in a single backend call.
  return request("/api/sessions/clear", {
    method: "POST",
  });
}

// ========================
// Admin API
// ========================
export async function getAdminOverview() {
  // Admin KPI summary (counts).
  return request("/api/admin/overview", {
    method: "GET",
  });
}

export async function getAdminUsers() {
  // Admin user list.
  return request("/api/admin/users", {
    method: "GET",
  });
}

export async function getAdminPrompts() {
  // Admin prompt list.
  return request("/api/admin/prompts", {
    method: "GET",
  });
}
