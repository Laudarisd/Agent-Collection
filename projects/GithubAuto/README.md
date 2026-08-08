# GithubAuto Advanced v4

GithubAuto is an interactive local Git/GitHub manager designed for repositories
stored under:

```text
GithubAuto/repo/
```

The major change in v4 is **inspect first, choose second**.

It no longer automatically commits and pushes every repository simply because a
local file changed.

## Model

The configured local model is:

```text
../llm_models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf
```

Expected layout:

```text
workspace/
├── GithubAuto/
└── llm_models/
    ├── Qwen3-4B-Instruct-2507-Q4_K_M.gguf
    └── Qwen3-4B-Q4_K_M.gguf
```

The model is used only to write commit subjects.

Git itself decides repository state and performs fetch/pull/rebase/merge/push.

## Install

```bash
python -m pip install -r requirements.txt
```

## Run

```bash
python main.py
```

## Main menu

### 1. Scan & compare all repositories

Safe overview.

It runs `git fetch --prune` for configured remotes and shows:

- current branch
- changed-file count
- local commits ahead of remote
- remote commits behind
- missing/broken remotes
- diverged branches
- interrupted merge/rebase operations

It does **not** commit, pull, merge, rebase, or push.

### 2. Smart Sync Assistant

Shows only repositories needing attention.

Examples:

```text
Repository                  Files   ↑   ↓   Status
Agent-Collection                1   0   0   LOCAL CHANGES
Laudarisd                       0   0   3   REMOTE AHEAD
Research                        2   1   0   LOCAL AHEAD
BrokenRepo                      0   0   0   REMOTE ERROR
```

The user chooses the repository number and then the action.

### 3. Repository Manager

Manual control for one repository:

- fetch
- fast-forward pull
- rebase
- merge
- push existing commits
- show changed files/diffs
- commit selected files
- commit and push selected files
- commit all
- discard tracked-file changes
- delete a file
- branch management
- history/revert/reset
- stash
- remote repair/create/replace
- optional `.gitignore` hygiene
- local repository deletion
- remote GitHub repository deletion

## Important: Git cannot push one file

Git pushes commits, not individual files.

Therefore GithubAuto's:

```text
Commit & push selected file(s)
```

does this:

```text
choose changed file(s)
        ↓
stage ONLY selected file(s)
        ↓
generate one commit message
        ↓
commit ONLY selected file(s)
        ↓
push that commit
```

If the current branch already contains older unpushed commits, GithubAuto warns
that Git would push those older commits too.

## Pull choices

### Fetch

```text
git fetch --prune origin
```

Downloads remote metadata and commits but does not alter working files.

### Fast-forward pull

```text
git pull --ff-only
```

Safest pull mode. It succeeds only when the current branch can move forward
without creating a merge commit or rebase.

### Rebase

```text
git rebase @{upstream}
```

Replays local commits after the newest remote commits. This gives a clean,
linear history.

GithubAuto requires a clean working tree and automatically aborts a failed
rebase so it does not leave the repository half-rebased.

### Merge

```text
git merge @{upstream}
```

Combines local and remote histories. It may produce a merge commit.

GithubAuto aborts a failed merge and reports conflicts.

## Revert vs reset

### Revert

Recommended for commits that may already be shared:

```text
git revert <commit>
```

It creates a new commit that reverses an older commit.

### Soft reset

Moves HEAD backward but leaves changes staged.

### Mixed reset

Moves HEAD backward and leaves changes unstaged.

### Hard reset

Permanently discards work. It is disabled by default:

```yaml
safety:
  allow_hard_reset: false
```

## Branch operations

The Branch Manager supports:

- list local/remote branches
- create branch
- create and switch
- switch branch
- push branch and create upstream tracking
- create branch and push
- merge branch into current
- rebase current branch onto another branch
- safe local branch deletion
- force local branch deletion with typed confirmation
- remote branch deletion with typed confirmation

## Remote repair

A repository may have:

```text
origin -> https://github.com/user/repository.git
```

even if that GitHub repository was later deleted or renamed.

GithubAuto reports this as `REMOTE ERROR`.

Remote Manager can:

- test/fetch origin
- create/find a GitHub repository matching the local folder name
- replace the remote URL manually
- remove the local remote

Creating a GitHub repository requires `GITHUB_TOKEN` because normal Git cannot
create a GitHub repository.

## New repositories

A plain folder under `repo/` can be initialized:

```text
repo/NewProject/
      ↓
git init -b main
      ↓
starter .gitignore
      ↓
optional GitHub remote creation
      ↓
commit selected/all files
      ↓
push
```

Existing repositories are **not** silently modified during scanning.

## Authentication

`.env`:

```text
GITHUB_TOKEN=
GITHUB_OWNER=
```

Normal Git operations may continue using the authentication already configured
on your Mac.

The token is used for GitHub API operations such as creating or deleting remote
repositories.

## Destructive-action defaults

```yaml
safety:
  confirm_destructive_actions: true
  allow_remote_repo_delete: false
  allow_hard_reset: false
```

Remote repository deletion is present in the menu but disabled by default.

To intentionally enable it:

```yaml
allow_remote_repo_delete: true
```

Deletion then requires typed confirmation twice.

## `.DS_Store`

Scanning does not edit `.gitignore`.

For existing repositories, use:

```text
Repository Manager
→ Repository hygiene
```

when you want GithubAuto to suggest/add:

```text
.env
.env.*
!.env.example
.DS_Store
Thumbs.db
__pycache__/
*.pyc
```

This avoids creating unnecessary `.gitignore` commits across every repository.
