# AGENTS.md

## Project purpose

Build a local-first job application agent for its local user.

The agent must use the downloaded `llama.cpp` model:

`models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf`

The system should help with job analysis, resume selection, resume tailoring,
cover-letter tailoring, application-question drafting, browser-assisted form
completion, and application tracking.

## Job scope

### Industry roles

Only accept industry jobs located in **Australia**.

Target titles include:

- AI Engineer
- Artificial Intelligence Engineer
- Machine Learning Engineer
- Applied Machine Learning Engineer
- Computer Vision Engineer
- Data Scientist
- Applied Data Scientist
- Research Engineer
- Scientific Machine Learning Engineer

### Research and postdoctoral roles

Only accept research or postdoctoral roles located in:

- New Zealand
- Canada
- United States

Target domains include:

- Artificial intelligence
- Machine learning
- Scientific machine learning
- Granular materials
- Granular flow
- Discrete element method
- LIGGGHTS
- Digital twins
- Echo state networks
- Reservoir computing
- Time-series forecasting
- Image processing
- Computer vision
- OCR
- Remote sensing
- Geospatial AI
- Simulation-based learning
- Physics-informed machine learning

## Reference documents

Read reference resumes from:

- `data/ai_resume/`
- `data/ml_resume/`
- `data/data_science_resume/`
- `data/postdoctoral_resume/`

Read reference cover letters from:

- `data/cover_letters/industry/`
- `data/cover_letters/postdoctoral/`

Multiple files may exist in each folder. Treat them as factual references, not
as text that must be copied verbatim.

Never invent:

- employers
- job titles
- dates
- qualifications
- publications
- software skills
- numerical achievements
- visa status
- work authorization
- salary expectations
- personal information

Unknown or conflicting information must be flagged for human review.

## Application safety

Default workflow:

1. Find or import a job.
2. Analyze eligibility and match.
3. Select the correct resume source.
4. Tailor the resume.
5. Tailor the cover letter.
6. Check factual consistency.
7. Show all generated documents to the user.
8. Fill supported application fields.
9. Stop before final submission.
10. Submit only after explicit user approval.

Never:

- bypass CAPTCHA
- bypass anti-bot systems
- create false accounts
- guess legal declarations
- auto-answer disability, diversity, criminal-history, visa, citizenship, or
  security-clearance questions
- submit an application without explicit approval
- perform uncontrolled mass applications

## Coding rules

- Keep every Python, shell, YAML, and Markdown file below **500 lines**.
- Prefer files below 300 lines.
- Split a file before it reaches 450 lines.
- Use simple, descriptive names.
- Use classes only when they clarify responsibility.
- Use small functions with one clear purpose.
- Add useful comments explaining intent, not obvious syntax.
- Add type hints to public Python functions.
- Validate external and model-generated data with Pydantic.
- Use structured JSON output from the local model.
- Store application records in SQLite.
- Keep secrets and local paths in `.env`.
- Keep user-editable behavior in `config/job_agent.yaml`.
- Do not place business rules directly in Streamlit UI code.
- Add tests for filtering, profile selection, factual checks, and JSON parsing.

## Preferred architecture

Use:

- Python 3.11+
- Streamlit for the first local interface
- `requests` for the `llama-server` API
- Pydantic for validation
- PyYAML for configuration
- SQLite for tracking
- `python-docx` and `docxtpl` for document generation
- `pypdf` for PDF reference extraction
- Playwright only in the later browser-assistance phase

Do not introduce LangChain or LangGraph in the first version. Add an orchestration
framework only when plain Python services are no longer sufficient.

## Local model API

The local model server is expected at:

`http://127.0.0.1:8080`

Use the OpenAI-compatible endpoint:

`POST /v1/chat/completions`

Model behavior:

- temperature: 0.1 for extraction and validation
- temperature: 0.3 for resume and cover-letter writing
- context length: 4096 initially
- require JSON schemas for extraction tasks

## Development order

Implement in this order:

1. Settings and YAML loading
2. Local LLM client
3. Reference-document loader
4. Job-description parser
5. Country and role eligibility filter
6. Resume-profile selector
7. Match scorer
8. Resume tailoring
9. Cover-letter tailoring
10. Factual consistency checker
11. DOCX/PDF generation
12. SQLite application tracker
13. Streamlit review workflow
14. Browser-assisted application filling
15. Manual final-submission gate

Complete and test one phase before beginning the next.
