# GithubAuto

GithubAuto is a local-first Git/GitHub synchronization agent built around
normal Git commands plus your local llama.cpp model.

## Current local model

The project is configured to use:

```text
../llm_models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf
```

Expected layout:

```text
projects/
├── GithubAuto/
└── llm_models/
    ├── Qwen3-4B-Instruct-2507-Q4_K_M.gguf
    └── Qwen3-4B-Q4_K_M.gguf
```

The Instruct model is used because this agent needs a model that follows a
small, explicit instruction when writing commit subjects.

## What the agent manages

Put projects directly inside:

```text
GithubAuto/repo/
```

The agent handles two kinds of entries.

### Existing Git repository

```text
repo/MyExistingProject/.git/
```

The agent checks its remote state, local changes, commits, pulls, merges, and
pushes according to `config.yaml`.

### New normal folder

```text
repo/MyNewProject/
```

When sync mode is used, the agent can:

1. initialize the folder as Git
2. create branch `main`
3. protect `.env` through the child repository's `.gitignore`
4. create the repository on GitHub
5. add `origin`
6. ask the local Qwen model for the initial commit message
7. commit
8. push and configure upstream tracking

New GitHub repositories are **private by default**.

## Authentication

Existing pull/push operations can continue using Git authentication already
configured on your Mac.

Automatic remote repository creation uses the GitHub REST API, so place a
GitHub Personal Access Token in:

```text
GithubAuto/.env
```

```text
GITHUB_TOKEN=your_token_here
```

Optional organization creation:

```text
GITHUB_OWNER=
```

Leave `GITHUB_OWNER` empty to create repositories under the GitHub account
authenticated by the token.

The token is not stored inside Git remote URLs.

## Install

```bash
python -m pip install -r requirements.txt
```

You already have `llama-cli` installed.

## First model check

From `GithubAuto/`:

```bash
ls ../llm_models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf
```

Then:

```bash
llama-cli -m "../llm_models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf" \
  -p "Write one short Git commit subject for adding repository sync."
```

## Run

```bash
python main.py
```

Menu:

```text
1. Check and sync all repositories
2. Check repository status only
3. Exit
```

Start with option 2.

## Synchronization rules

After fetch:

```text
Local = Remote
    -> nothing

Remote ahead only
    -> fast-forward pull

Local ahead only
    -> push

Local + Remote both ahead
    -> normal Git merge
    -> push if successful

Merge conflict
    -> abort merge
    -> report conflicted files
    -> do not let the LLM rewrite source code automatically
```

## Local changes

When automatic commit is enabled:

1. secret-like paths are checked first
2. local changes are summarized
3. Qwen generates one commit subject
4. changes are staged
5. Git creates the commit

The LLM does **not** decide which shell commands to run.

## Secret protection

Every managed child repository is given these `.gitignore` rules when missing:

```text
.env
.env.*
!.env.example
```

Automatic commits also stop when changed files look like:

```text
.env
.env.*
*.pem
*.key
*.p12
*.pfx
id_rsa
id_ed25519
```

## Configuration

Important settings:

```yaml
github:
  create_remote_if_missing: true
  initialize_plain_folders: true
  default_visibility: "private"
  remote_name: "origin"

git:
  auto_commit: true
  auto_pull: true
  auto_merge: true
  auto_push: true
```

Change `default_visibility` to `public` only when you intentionally want newly
created repositories to be public.


## No python-dotenv dependency

GithubAuto now reads `.env` with a small standard-library loader, so
`python-dotenv` is not required.
