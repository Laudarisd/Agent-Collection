# Local Job Application Agent

A small, local-first assistant for preparing targeted job applications. Job and
resume content is sent only to the local `llama.cpp` server. The first release
analyzes eligibility, selects a reference resume, prepares evidence-constrained
drafts, shows warnings, and stores reviewed drafts in SQLite. It cannot submit
applications.

## Setup

Python 3.11+, `uv`, and `llama-server` are required.

```bash
uv sync --extra dev
cp .env.example .env
```

Place factual resumes and cover-letter examples in the directories under
`data/` named in `config/job_agent.yaml`. Supported formats are `.txt`, `.md`,
`.docx`, and `.pdf`.

## Run

Start the complete agent with one command:

```bash
./scripts/start_agent.sh
```

It starts the private model server, waits until the model is ready, starts
Streamlit, and opens the application at [http://localhost:8501](http://localhost:8501).

For troubleshooting, the two services can still be started separately:

```bash
./scripts/run_llm.sh
./scripts/run_app.sh
```

Open the Streamlit URL, paste a complete advertisement, and review each result.
Citizenship, visa, clearance, diversity, disability, criminal-history, salary,
and other sensitive declarations always remain manual.

## Test

```bash
uv run pytest
```
