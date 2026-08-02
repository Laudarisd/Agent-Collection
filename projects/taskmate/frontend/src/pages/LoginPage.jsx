// Authentication page: login/register form and animated preview panel.
// ========================
// Imports
// ========================
import { useState } from "react";

import { loginUser, registerUser } from "../services/api.js";
import "../styles/LoginPage.css";

export default function LoginPage({ onLoginSuccess }) {
  // ========================
  // Local state
  // ========================
  // Switches between login and register forms.
  const [mode, setMode] = useState("login");
  // Register-only field for display name.
  const [name, setName] = useState("");
  // Shared auth credential fields.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // UX state for async submit lifecycle.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ========================
  // Form submit
  // ========================
  async function handleSubmit(event) {
    event.preventDefault();
    // Reset previous errors before next request.
    setError("");
    setLoading(true);
    try {
      // Route request by current mode.
      const user =
        mode === "login"
          ? await loginUser({ email, password })
          : await registerUser({ name, email, password });
      // Bubble auth success to parent shell.
      onLoginSuccess(user);
    } catch (err) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  // ========================
  // Render
  // ========================
  return (
    <main className="auth-layout">
      {/* Left panel: auth controls and credential form. */}
      <section className="content-page auth-page">
        <h2>{mode === "login" ? "Log in" : "Register"}</h2>
        <p>
          Register a new account or log in to an existing one to access your TaskMate workspace.
        </p>
        <div className="auth-switch">
          {/* Mode switcher toggles active form fields and button styles. */}
          <button
            type="button"
            className={mode === "login" ? "primary-button" : "ghost-button"}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === "register" ? "primary-button" : "ghost-button"}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {/* Name field appears only during registration. */}
          {mode === "register" ? (
            <input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          ) : null}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={mode === "register" ? 8 : 1}
          />
          {error ? <p className="error-text">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </section>

      {/* Right panel: animated preview of chat interaction. */}
      <section className="content-page auth-preview-panel">
        <div className="preview-chat">
          <div className="preview-bubble preview-bubble--user preview-step-1">
            Can you tell me todays weather in Sydney?
          </div>
          <div className="preview-bubble preview-bubble--assistant preview-step-2">
            Sydney weather today is mostly sunny with a high near 26 C and light winds.
          </div>
          <div className="preview-bubble preview-bubble--user preview-step-3">
            Help me to solve the following problems.
          </div>
          <div className="preview-bubble preview-bubble--assistant preview-step-4">
            Sure. Share each problem one by one and I will solve them with a clear, step-by-step answer.
          </div>
        </div>
      </section>
    </main>
  );
}
