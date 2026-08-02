# Frontend (TaskMate)

## Purpose
This frontend is a React + Vite chat workspace for TaskMate.  
It handles authentication UI, thread/session UX, prompt submission, history display, and calls backend APIs.

## Code Organization Notes
- Frontend files now include inline section markers (`// ========================`) to separate:
  - imports
  - state
  - effects
  - handlers/actions
  - derived values
  - render
- This is intentionally verbose so debugging and future edits are faster.

## Entry And Main Flow
- `src/main.jsx`
  - Mounts React app.
  - Wraps app with `BrowserRouter`.
  - Loads global styles from `src/styles/index.css`.
- `src/App.jsx`
  - Global app shell (navbar, routes, footer).
  - Bootstraps auth state via `getCurrentUser()`.
  - Routes users to pages:
    - `/` -> chat workspace (`ChatPage`)
    - `/login` -> auth page (`LoginPage`)
    - `/about-us`, `/model-information`, `/contact-us` -> static pages

## Pages
- `src/pages/LoginPage.jsx`
  - Login/Register screen.
  - Uses API service login/register and updates parent auth state.
- `src/pages/ChatPage.jsx`
  - Main logged-in workspace.
  - Loads sessions (threads), prompt history, handles send prompt/new session/rename/delete/delete-all.
  - Renders 3-panel layout:
    - left: `History`
    - middle: `ResponseDisplay` + `PromptInput`
    - right: tool activity panel (conditional)
- `src/pages/AboutPage.jsx`
- `src/pages/ModelInfoPage.jsx`
- `src/pages/ContactPage.jsx`
  - Static informational pages.

## Components
- `src/components/History.jsx`
  - Session/thread list.
  - Select thread, create new session, rename/delete single session, delete all sessions from user view.
- `src/components/PromptInput.jsx`
  - Prompt textarea and send action.
  - Supports Enter to send, Shift+Enter newline.
- `src/components/ResponseDisplay.jsx`
  - Shows user/assistant messages for active thread.

## API Layer
- `src/services/api.js`
  - Central fetch wrapper.
  - Auth token storage (`localStorage`).
  - Exposes API methods:
    - auth: `registerUser`, `loginUser`, `getCurrentUser`
    - sessions: `getSessions`, `createSession`, `renameSession`, `deleteSession`, `clearAllSessions`
    - prompts: `createPrompt`, `getPromptHistory`
    - admin: `getAdminOverview`, `getAdminUsers`, `getAdminPrompts`
- `src/services/chatTransport.js`
  - Prompt pipeline wrapper used by chat page.
  - Single place to track prompt send/receive path:
    - `submitPromptToBackend(...)`
    - `fetchSessionPrompts(...)`

## Prompt Flow (Exact Trace)
1. User types and submits in `src/components/PromptInput.jsx`.
2. `onSubmit` calls `handlePromptSubmit(...)` in `src/pages/ChatPage.jsx`.
3. `ChatPage` sends prompt through `submitPromptToBackend(...)` in `src/services/chatTransport.js`.
4. `chatTransport` calls `createPrompt(...)` in `src/services/api.js`.
5. Backend response is returned to `ChatPage` and merged into active session state.
6. UI refresh happens through `src/components/ResponseDisplay.jsx`.
7. Session history reload calls `fetchSessionPrompts(...)` in `chatTransport`, which calls `getPromptHistory(...)` in `api.js`.

## Style Files
- `src/styles/index.css`: global variables and base reset.
- `src/styles/Layout.css`: main app shell, navbar/footer, shared content container.
- `src/styles/LoginPage.css`: login/register page layout and preview animation.
- `src/styles/ChatPage.css`: 3-panel chat workspace and tool panel.
- `src/styles/AboutPage.css`: About page scoped styles.
- `src/styles/ContactPage.css`: Contact page scoped styles.
- `src/styles/ModelInfoPage.css`: Model info page scoped styles.
- `src/styles/History.css`: thread panel and actions menu.
- `src/styles/PromptInput.css`: prompt composer.
- `src/styles/ResponseDisplay.css`: chat transcript view.

## File Connections (Quick Map)
- `main.jsx` -> `App.jsx`
- `App.jsx` -> pages + `services/api.js` + `styles/Layout.css`
- `ChatPage.jsx` -> `History.jsx` + `PromptInput.jsx` + `ResponseDisplay.jsx` + `services/chatTransport.js` + `services/api.js`
- `History.jsx` -> `styles/History.css`
- `PromptInput.jsx` -> `styles/PromptInput.css`
- `ResponseDisplay.jsx` -> `styles/ResponseDisplay.css`

## Run
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```
