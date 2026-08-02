# Taskmate

Taskmate is a generative AI workplace where you can chat with a single LLM or run multi-LLM sessions in which multiple models act as a counselor.
It works with a free Gemini API key (or any other API key) and also supports local Ollama large models.
The main purpose is text generation, code generation, and other multi-step tasks such as:
- Summarizing and rewriting content
- Drafting emails, docs, and reports
- Explaining code and debugging suggestions
- Planning tasks and producing checklists
- Translating and simplifying text

Core stack:
- React frontend chat UI with sessions/threads and multi-LLM mode
- FastAPI backend with auth, prompt APIs, and DB persistence
- Provider layer for Gemini, other APIs, and local Ollama models (with fallback)

## Preview
### Home Page
![TaskMate Home](img/1.png)

### Chat Workspace
![TaskMate Chat](img/2.png)

### Chat Activity Demo
![TaskMate Chat Activity](img/1gif.gif)

## What It Does
- User register/login (admin + regular users)
- Create, rename, delete, and clear chat sessions (soft-delete behavior)
- Send prompts from frontend to backend
- Store prompt/response history per user in database
- Display chat history in a threaded UI

## Current Stack
- Frontend: React + Vite
- Backend: FastAPI + SQLAlchemy
- Package manager: `uv` (root-level)
- Database mode:
  - MySQL if MySQL env vars are provided
  - SQLite fallback otherwise (`backend/database/app.db`)

## Where To Add Gemini Key
Add it in:
- `backend/.env`

Required variable:
```env
GEMINI_API_KEY=your_key_here
```

Optional model override:
```env
GEMINI_MODEL=gemini-3-flash-preview
```

## Run Project
Start both backend + frontend:
```bash
./run.sh
```

URLs:
- Frontend: `http://localhost:5174`
- Backend health: `http://localhost:8000/health`

Logs (daily files):
- `logs/backend_YYYY-MM-DD.log`
- `logs/frontend_YYYY-MM-DD.log`

## Run Individually
Backend:
```bash
uv sync
cd backend
uv run --project .. python app.py
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

## Key Folders
- `frontend/` -> chat UI and API client
- `backend/` -> FastAPI app, auth, sessions/prompts APIs, Gemini service
- `backend/database/` -> SQLite DB + schema reference
- `logs/` -> runtime logs

## TODO (Planned)
- Connect MCP server end-to-end with frontend
- Add tool execution stream panel for code/file tasks
- Add code-generation UI actions
- Add file generation/download workflow
- Add model selection UI and multi-model routing
- Add more model providers/options (beyond Gemini) with routing controls
- Add an LLM "counsellor/reviewer" stage before final client response
- Add robust migrations (Alembic) and production-grade DB versioning

## Notes
- If Gemini quota is exhausted, backend returns local fallback response so chat flow does not break.
- Prompt history remains in DB and can be used for memory/context features.
