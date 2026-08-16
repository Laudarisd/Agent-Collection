# LocalAgentWorlbase

> Your private command center for local AI, cloud models, and competitive intelligence.

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Ready-4169E1?logo=postgresql&logoColor=white)
![Local AI](https://img.shields.io/badge/Local_AI-Ollama_%7C_llama.cpp-5A45FF)

LocalAgentWorlbase is a local-first AI workspace for private conversations and
competitive-marketing intelligence. Use cloud providers or CPU-friendly local
models, monitor public competitor websites, preserve historical evidence, detect
meaningful changes, and ask AI to explain what those changes mean for your brand.

**[Features](#what-is-implemented) · [Quick start](#fast-local-setup) · [Local models](#ollama) · [Deployment](DEPLOYMENT.md) · [Security](SECURITY.md)**

The project is application code, not a static interface prototype. Unimplemented future modules are not represented by fake screens or seeded data.

## What is implemented

### GPT-style AI workbase

- Responsive chat UI with sidebar history and a model selector.
- New chat, search, rename, delete, edit/resubmit, regenerate, copy, and stop generation.
- Streaming responses.
- OpenAI, Anthropic Claude, and Google Gemini adapters.
- API-key provider detection plus manual override.
- Dynamic cloud model discovery instead of a fixed model catalog.
- Ollama discovery and streaming chat.
- llama.cpp OpenAI-compatible discovery and streaming chat.
- CPU-first llama.cpp launch scripts for macOS/Linux and Windows.
- GGUF models through llama.cpp and installed Ollama models.
- Vision/image prompting when the selected provider/runtime exposes vision capability.
- Text, code, CSV, JSON, Markdown, and common image attachments.
- Light, dark, and system appearance.
- Configurable system instruction and Enter-to-send behavior.
- Browser-local conversation history using IndexedDB.
- Settings, license page, security notes, and CI.

### Competitive website intelligence — MVP 1

- Multiple Brand Workspaces.
- Brand profile: website, industry, description, services, countries, languages, keywords, positioning, and value proposition.
- Competitor creation and management.
- Public website crawler with robots.txt handling, sitemap discovery, same-origin crawling, page caps, crawl-delay handling, body-size limits, redirect validation, and private-network blocking.
- Historical page snapshots in PostgreSQL.
- Extracted titles, meta descriptions, headings, clean text, CTAs, pricing-like text, page language, and source HTML.
- First-crawl baseline behavior: the initial crawl stores evidence without creating a false alert storm.
- Change events for new pages, removed pages, unavailable pages, pricing changes, title changes, CTA changes, and meaningful content changes.
- Dashboard with tracked competitors, recent changes, high-priority activity, and pages tracked.
- Change feed with source links and importance filtering.
- Protected cron endpoint for due-competitor monitoring (`/api/jobs/monitor`) with configurable interval/batch size and overlapping-crawl protection.
- Database-grounded AI chat: when a Brand Workspace is selected, relevant brand data, competitor profiles, recent change events, and page evidence are retrieved and supplied to the selected LLM with instructions to distinguish observed evidence from inference.

## Architecture

```text
                                      ┌─────────────────────────────┐
                                      │        Next.js UI           │
                                      │ Chat + Intelligence views   │
                                      └──────────────┬──────────────┘
                                                     │
                   ┌─────────────────────────────────┼──────────────────────────────┐
                   │                                 │                              │
                   ▼                                 ▼                              ▼
       Cloud AI route handlers              Intelligence API                Browser-direct local AI
   OpenAI / Claude / Gemini        Brand / Competitor / Changes / Crawl        Ollama / llama.cpp
                   │                                 │
                   │                                 ▼
                   │                            PostgreSQL
                   │                                 │
                   │                       snapshots + events
                   │                                 ▲
                   │                                 │
                   └──────────── grounded chat context ─────── Website crawler
```

Cloud credentials are forwarded through the application's server route for the active request. Local Ollama/llama.cpp traffic intentionally goes directly from the browser to the local runtime so a deployed server does not need access to a visitor's `localhost`.

## Requirements

- Node.js 22+
- npm 10+
- PostgreSQL for competitive-intelligence features
- Optional Ollama for local models
- Optional llama.cpp `llama-server` for direct GGUF models

## Fast local setup

Install PostgreSQL locally (e.g. `brew install postgresql@17` on macOS, or your distro's package) and create a database and user:

```bash
createdb ai_workspace
```

Copy `.env.example` to `.env.local` and point `DATABASE_URL` at your local PostgreSQL instance:

```text
DATABASE_URL=postgresql://ai_workspace:<your-password>@localhost:5432/ai_workspace
```

Install and start the application:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The database schema is created idempotently on first intelligence request. No seed/example competitors are inserted.

For a public multi-user deployment, read `SECURITY.md` first. The current release is designed for a private/personal professional deployment and does not claim to include organization authentication or a secret vault.

## First intelligence workflow

1. Open **Dashboard** or **Competitors**.
2. Create a Brand Workspace.
3. Add a competitor with its public website.
4. Choose **Create baseline**. The crawler records the current website but intentionally creates no change alerts from that first snapshot.
5. Run **Crawl again** later.
6. Review normalized events under **Changes**.
7. Open **AI Chat** and ask a question such as what changed, why it matters, or what the brand should do next. The chat retrieves private evidence for the selected brand before sending the prompt to the active LLM.

## Scheduled monitoring

Manual **Create baseline / Crawl again** actions work without a scheduler. For deployed periodic monitoring, set a long random `CRON_SECRET`, then configure your scheduler to call:

```text
GET /api/jobs/monitor
Authorization: Bearer <CRON_SECRET>
```

The endpoint selects competitors whose latest crawl is older than `MONITOR_INTERVAL_HOURS` (default 6) and processes up to `MONITOR_BATCH_SIZE` (default 1, built-in maximum 5). Keeping the default batch small reduces timeout risk on server platforms. A database constraint prevents two active crawl runs for the same competitor, and abandoned runs older than one hour are recovered as failed before a new crawl starts.

## API key providers

Choose **API Key** in the top-right corner. Paste a key and the app attempts to detect OpenAI, Anthropic, or Gemini. If the format is ambiguous, select the provider manually. The connection is verified by requesting that provider's model list.

By default a cloud credential is stored in `sessionStorage`. **Remember on this device** moves it to `localStorage`. This is intended for a trusted personal device, not shared computers.

## Ollama

Start Ollama and install models through Ollama's normal model-management workflow. Then choose **Local Model → Ollama** and detect models from:

```text
http://127.0.0.1:11434
```

The app asks Ollama for installed-model metadata and capability information. Vision-capable models can receive image attachments.

A deployed HTTPS site may require explicit Ollama origin/CORS configuration or a trusted local HTTPS gateway, depending on browser policy.

## llama.cpp — CPU / GGUF

The included launchers default to CPU inference with zero GPU-offloaded layers.

macOS/Linux:

```bash
export LLAMA_MODEL=/absolute/path/model-Q4_K_M.gguf
./scripts/start-llama.sh
```

Windows PowerShell:

```powershell
$env:LLAMA_MODEL="D:\models\model-Q4_K_M.gguf"
.\scripts\start-llama.ps1
```

Then choose **Local Model → llama.cpp** and use:

```text
http://127.0.0.1:8080
```

For a multimodal GGUF with a separate projector, set `LLAMA_MMPROJ` before launching. The UI reads the running server's model/capability metadata rather than maintaining a hard-coded GGUF architecture list.

## Website crawler behavior

The crawler is intentionally conservative.

- Public HTTP/HTTPS only.
- Refuses localhost, private/non-routable IPs, and common local hostnames.
- Validates every redirect before following it.
- Stays on the competitor website origin.
- Reads robots.txt and applies compatible allow/disallow rules and crawl delay.
- Uses same-origin sitemap discovery when available; otherwise performs bounded link discovery.
- Does not crawl obvious binary/media assets as pages.
- Defaults to 30 successfully parsed pages per run, configurable up to the built-in ceiling.
- Stores crawl errors and marks a run `partial` rather than hiding failures.
- Only marks sitemap pages as removed when sitemap coverage is known to be complete for the bounded run.

Crawler access is not a substitute for legal/contractual review. Operate it only against public pages you are allowed to monitor.

## Data model

The MVP uses these durable tables:

```text
brands
competitors
crawl_runs
web_pages
page_snapshots
change_events
```

The event-oriented design is deliberate. Future SEO, ads, social, review, backlink, and pricing collectors can normalize their important findings into the same intelligence-event layer instead of forcing the AI to reason over raw vendor data.

## Current scope vs. roadmap

The supplied product brief describes a larger platform including SEO/rank tracking, backlinks, ad intelligence, social analytics, review intelligence, content clustering, opportunity detection, strategy actions, scheduling, vector RAG, and a richer tool-calling marketing agent. Those are **roadmap modules**, not fake features in this package.

This release implements the brief's first milestone end-to-end: Brand → Competitor → Website Crawler → Snapshots → Change Detection → evidence-grounded AI explanation. The database and event boundaries are designed so later modules can be added without rebuilding the chat/application shell.

## Validation

See `VALIDATION.md`. In the generation environment, source-level checks were run without downloaded npm dependencies. The included GitHub Actions workflow performs dependency installation, TypeScript checking, linting, and a production Next.js build in a normal networked CI environment.

## License

Proprietary. See `LICENSE`.
