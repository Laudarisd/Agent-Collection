# Local Job Application Agent — Codex Project Brief

## 1. Goal

Create a simple, local-first application that helps prepare and manage targeted
job applications.

The application must use the existing local model:

```text
models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf
```

The model is served by `llama-server`; do not download another model during the
first implementation.

The application should save time by:

- analyzing job advertisements
- rejecting jobs outside the allowed scope
- selecting the most relevant existing resume
- tailoring resume content without changing facts
- tailoring cover letters using existing examples
- drafting ordinary application questions
- preparing browser-assisted applications
- tracking every application and document version

The first release must stop before final submission and require explicit human
approval.

---

## 2. Target jobs

### 2.1 Australia: industry roles only

Accept:

- AI Engineer
- Machine Learning Engineer
- Applied ML Engineer
- Computer Vision Engineer
- Data Scientist
- Applied Data Scientist
- Research Engineer
- Scientific Machine Learning Engineer
- closely related AI, ML, data-science, image-processing, or time-series roles

Reject or flag:

- roles outside Australia
- unrelated analyst roles
- pure business-intelligence roles with no meaningful ML component
- roles requiring a mandatory qualification the applicant does not have
- roles requiring citizenship or clearance when eligibility is unknown

### 2.2 New Zealand, Canada, and United States: research roles

Accept:

- Postdoctoral Researcher
- Postdoctoral Fellow
- Research Fellow
- Research Associate
- Research Scientist
- Research Engineer
- academic or institute positions aligned with the applicant's research

Prioritize these topics:

- granular materials and granular flow
- discrete element method and LIGGGHTS
- digital twins
- scientific and physics-informed machine learning
- reinforcement learning for physical systems
- echo state networks and reservoir computing
- time-series forecasting
- computer vision and image processing
- OCR
- remote sensing and geospatial AI
- simulation data and surrogate modelling

---

## 3. Reference data

The user will place several resumes in:

```text
data/ai_resume/
data/ml_resume/
data/data_science_resume/
data/postdoctoral_resume/
```

The user will place cover-letter references in:

```text
data/cover_letters/industry/
data/cover_letters/postdoctoral/
```

Supported input formats in the first version:

- `.txt`
- `.md`
- `.docx`
- `.pdf`

The reference loader must:

1. Read every supported file in a selected folder.
2. Preserve the filename and source path.
3. Extract plain text.
4. Ignore duplicate text.
5. Report unreadable files.
6. Never silently omit a reference.
7. Build a factual evidence map for every generated claim.

Do not use vector embeddings initially. Start with deterministic keyword
retrieval, section labels, and local-model selection. This keeps memory and disk
usage low.

---

## 4. Core workflow

### Step 1: Import job

Allow:

- pasted job description
- pasted job URL
- manually saved text or PDF
- later: browser-assisted import

Store the original advertisement unchanged.

### Step 2: Parse job

Return validated structured data:

- title
- organization
- country
- city
- work mode
- employment type
- responsibilities
- required skills
- preferred skills
- required education
- required experience
- research topics
- citizenship or clearance conditions
- visa or work-authorization statements
- salary
- closing date
- application URL
- required documents

### Step 3: Eligibility filter

Apply deterministic rules before model scoring.

Examples:

- Industry + Australia → allowed
- Industry + Canada → reject
- Postdoctoral + Canada → allowed
- Postdoctoral + Australia → reject under the current preference
- Missing country → review
- Mandatory citizenship requirement → review
- Unrelated profession → reject

### Step 4: Select career profile

Map the job to one source group:

- `ai_resume`
- `ml_resume`
- `data_science_resume`
- `postdoctoral_resume`

The selection result must include a clear reason.

### Step 5: Score match

Use separate scores:

- role alignment
- technical skills
- research/domain alignment
- education
- experience
- publications/projects
- location eligibility
- mandatory-requirement coverage

Return:

- overall score
- apply, review, or reject
- strengths
- gaps
- mandatory concerns
- evidence used from source resumes

### Step 6: Tailor documents

Generate:

- tailored resume
- tailored cover letter
- optional short recruiter message
- optional selection-criteria answers
- optional research statement only when requested

Rules:

- Preserve all facts.
- Do not invent metrics.
- Do not rename employers.
- Do not change employment dates.
- Do not claim a publication is accepted when it is only drafted or submitted.
- Do not copy keywords unnaturally.
- Keep an evidence record for each changed bullet.
- Use an academic CV for postdoctoral roles.
- Use a concise industry resume for AI, ML, and data-science roles.

### Step 7: Quality check

Run an independent validation stage that checks:

- factual support
- date consistency
- title and employer consistency
- job-name and company-name accuracy
- unsupported claims
- missing mandatory requirements
- wrong-country applications
- incorrect document type
- accidental references to another company
- grammar and formatting
- duplicate applications

Block approval when serious issues remain.

### Step 8: Human review

Display:

- job summary
- eligibility decision
- match score
- selected source documents
- tailored resume
- tailored cover letter
- unanswered sensitive questions
- quality-check findings

Provide explicit controls:

- approve documents
- request revision
- reject job
- open application page
- prepare form
- approve final submission

### Step 9: Browser assistance

Add only after document generation is stable.

Supported behavior:

- open the user's normal browser profile
- read visible fields
- fill basic contact and employment fields
- upload approved files
- insert approved text answers
- pause for CAPTCHA
- pause for authentication
- pause for sensitive questions
- pause before final submission

Never bypass website security or platform restrictions.

### Step 10: Track application

Store:

- organization
- role
- country
- URL
- date found
- date approved
- date submitted
- current status
- selected resume source
- generated document paths
- job match result
- unanswered questions
- notes
- follow-up date

---

## 5. Suggested modules

```text
app/
├── main.py
├── core/
│   ├── settings.py
│   ├── config_loader.py
│   ├── schemas.py
│   └── logging_setup.py
├── services/
│   ├── llm_client.py
│   ├── reference_loader.py
│   ├── job_parser.py
│   ├── eligibility_filter.py
│   ├── profile_selector.py
│   ├── match_scorer.py
│   ├── resume_tailor.py
│   ├── cover_letter_tailor.py
│   ├── factual_checker.py
│   ├── document_generator.py
│   └── application_tracker.py
├── browser/
│   ├── browser_manager.py
│   ├── form_reader.py
│   ├── form_filler.py
│   └── submission_guard.py
└── storage/
    ├── database.py
    └── repositories.py
```

This is a target structure. Create modules only when they are needed.

---

## 6. UI pages

Use a simple Streamlit interface.

### Dashboard

Show:

- jobs awaiting review
- recommended applications
- prepared documents
- submitted applications
- interviews and follow-ups

### Import Job

Provide:

- job description text area
- job URL field
- import button
- parsed information
- validation errors

### Job Review

Show:

- country/role eligibility
- match score
- strengths
- gaps
- selected resume source
- apply/review/reject recommendation

### Documents

Show and download:

- tailored resume
- cover letter
- selection criteria
- factual-check report

### Application

Show:

- required form fields
- approved answers
- unanswered sensitive fields
- browser-assistance controls
- final approval control

### Tracker

Show application history and status.

---

## 7. Local model integration

Start the server with:

```bash
./scripts/run_llm.sh
```

Use:

```text
http://127.0.0.1:8080/v1/chat/completions
```

Extraction calls should request JSON and use temperature `0.1`.

Writing calls should use temperature `0.3`.

Every extraction response must be validated with Pydantic. Retry once with a
repair prompt when JSON is invalid. If the second response is invalid, show the
error and stop rather than guessing.

Do not send resume or job data to external AI APIs in the first version.

---

## 8. Configuration ownership

Use `.env` for:

- local paths
- ports
- model settings
- public job-source URLs
- feature flags
- sensitive values added later

Use `config/job_agent.yaml` for:

- role names
- allowed countries
- domain keywords
- profile directories
- matching weights
- approval rules
- output rules

Do not hard-code these values in the application.

---

## 9. File-quality rules

- Hard maximum: 500 lines per code file.
- Refactor at 450 lines.
- Prefer 80–250 lines per module.
- Use descriptive variable and function names.
- Avoid generic names such as `data`, `item`, `do_work`, and `process` when a
  clearer name exists.
- Add module docstrings.
- Add short comments around important decisions.
- Avoid comments that merely repeat the code.
- Use type hints.
- Use dataclasses or Pydantic models for structured values.
- Use custom exceptions for expected failures.
- Use logging instead of scattered `print` statements.
- Keep UI code separate from business logic.
- Add tests while implementing each service.

---

## 10. Definition of done for the first release

The first release is complete when the user can:

1. Start `llama-server`.
2. Start the Streamlit app.
3. Paste a job description.
4. Receive structured job information.
5. Receive a correct country/role eligibility result.
6. See the selected resume source.
7. Generate a factual tailored resume draft.
8. Generate a factual tailored cover-letter draft.
9. Review validation warnings.
10. Save the job and documents to the local tracker.

Browser application submission is a later milestone.
