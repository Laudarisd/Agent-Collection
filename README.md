# Agent Collection

> Practical AI agents built to automate real work.

This repository brings together local-first assistants, workflow automation, and
task-focused agents. Each project is self-contained, documented, and designed to
be explored independently.

## Featured projects

| Project | What it does | Stack |
| --- | --- | --- |
| [LocalAgentWorlbase](projects/LocalAgentWorlbase/) | Private AI workspace with cloud and local models, plus competitor-change intelligence | Next.js, TypeScript, PostgreSQL |
| [Job Application Agent](projects/job-application-agent/) | Supports and automates the job-application workflow | Python |
| [TaskMate](projects/taskmate/) | Agent-powered task and productivity assistant | Full stack |

## Get started

Choose a project, open its README, and follow its setup guide. Projects manage
their own dependencies and environment configuration, so you can run one without
installing the rest of the collection.

```bash
git clone <repository-url>
cd Agent-Collection/projects/<project-name>
```

## Repository principles

- **Focused:** every project centers on agent reasoning, orchestration, or task execution.
- **Local-friendly:** projects favor transparent setup and local development.
- **Secure by default:** credentials belong in environment variables, never source control.
- **Honest scope:** READMEs distinguish implemented features from roadmap ideas.

## Security

Review a project's permissions, external integrations, and dry-run behavior before
connecting real accounts or data. Copy `.env.example` when provided and keep the
resulting local environment file private.

## Contributing

Contributions are welcome. Keep each agent in its own directory under `projects/`,
include a clear setup guide, and avoid committing generated builds, dependencies,
credentials, model weights, or private data.
