from __future__ import annotations

import base64
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path


class GitCommandError(RuntimeError):
    """Raised when a Git command fails."""

    def __init__(self, message: str, output: str = "") -> None:
        super().__init__(message)
        self.output = output


@dataclass(frozen=True)
class RepoState:
    name: str
    branch: str
    has_local_changes: bool
    ahead: int
    behind: int
    has_upstream: bool
    has_commits: bool


class GitClient:
    """Execute Git commands with consistent error handling."""

    SECRET_FILE_NAMES = {
        ".env",
        ".env.local",
        ".env.production",
        ".env.development",
        "id_rsa",
        "id_ed25519",
    }

    SECRET_SUFFIXES = {
        ".pem",
        ".key",
        ".p12",
        ".pfx",
    }

    def __init__(self, github_token: str | None) -> None:
        self.github_token = (github_token or "").strip()

    def _git_environment(self) -> dict[str, str]:
        """
        Build the environment used by Git.

        Existing OS-level Git authentication continues to work. When
        GITHUB_TOKEN is present, GitHub HTTPS requests can also use that token.
        The token is not stored in a remote URL.
        """
        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"

        if self.github_token:
            credential = f"x-access-token:{self.github_token}".encode("utf-8")
            encoded = base64.b64encode(credential).decode("ascii")

            env["GIT_CONFIG_COUNT"] = "1"
            env["GIT_CONFIG_KEY_0"] = "http.https://github.com/.extraheader"
            env["GIT_CONFIG_VALUE_0"] = f"AUTHORIZATION: basic {encoded}"

        return env

    def run(
        self,
        repo_path: Path | None,
        *args: str,
        check: bool = True,
    ) -> str:
        """Run one Git command and return stdout."""
        command = ["git", *args]

        try:
            result = subprocess.run(
                command,
                cwd=repo_path,
                env=self._git_environment(),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                "Git was not found. Install Git and make sure 'git' is in PATH."
            ) from exc

        stdout = result.stdout.strip()
        stderr = result.stderr.strip()

        if check and result.returncode != 0:
            raise GitCommandError(
                f"Git command failed: git {' '.join(args)}",
                output=stderr or stdout,
            )

        return stdout

    def init_repository(self, path: Path, branch: str = "main") -> None:
        """Initialize a normal folder as a Git repository."""
        self.run(path, "init", "-b", branch)

    def clone(self, url: str, destination: Path) -> None:
        """Clone an existing remote repository."""
        destination.parent.mkdir(parents=True, exist_ok=True)
        self.run(None, "clone", url, str(destination))

    def is_git_repo(self, path: Path) -> bool:
        """Return True when the path is inside a valid Git work tree."""
        if not path.is_dir():
            return False
        result = self.run(path, "rev-parse", "--is-inside-work-tree", check=False)
        return result.strip().lower() == "true"

    def has_commits(self, repo_path: Path) -> bool:
        """Return False for a newly initialized repository with no commit yet."""
        result = subprocess.run(
            ["git", "rev-parse", "--verify", "HEAD"],
            cwd=repo_path,
            env=self._git_environment(),
            capture_output=True,
            check=False,
        )
        return result.returncode == 0

    def current_branch(self, repo_path: Path) -> str:
        """Return the checked-out branch name."""
        branch = self.run(repo_path, "branch", "--show-current").strip()
        if branch:
            return branch

        # An unborn branch may need symbolic-ref instead.
        branch = self.run(
            repo_path,
            "symbolic-ref",
            "--short",
            "HEAD",
            check=False,
        ).strip()
        return branch

    def has_local_changes(self, repo_path: Path) -> bool:
        """Check staged, unstaged, and untracked changes."""
        return bool(self.run(repo_path, "status", "--porcelain=v1").strip())

    def remote_exists(self, repo_path: Path, remote_name: str) -> bool:
        """Return True when the named remote exists."""
        remotes = self.run(repo_path, "remote").splitlines()
        return remote_name in {item.strip() for item in remotes}

    def add_remote(self, repo_path: Path, remote_name: str, url: str) -> None:
        """Add a Git remote."""
        self.run(repo_path, "remote", "add", remote_name, url)

    def get_remote_url(self, repo_path: Path, remote_name: str) -> str:
        """Return the configured remote URL."""
        return self.run(repo_path, "remote", "get-url", remote_name)

    def fetch(self, repo_path: Path, remote_name: str) -> None:
        """Refresh remote-tracking references without modifying local files."""
        self.run(repo_path, "fetch", "--prune", remote_name)

    def has_upstream(self, repo_path: Path) -> bool:
        """Return True when the current branch tracks a remote branch."""
        result = self.run(
            repo_path,
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
            check=False,
        )
        return bool(result.strip())

    def ahead_behind(self, repo_path: Path) -> tuple[int, int]:
        """Return (ahead, behind) compared with the configured upstream."""
        output = self.run(
            repo_path,
            "rev-list",
            "--left-right",
            "--count",
            "HEAD...@{upstream}",
        )
        parts = output.replace("\t", " ").split()
        if len(parts) != 2:
            raise GitCommandError(
                "Could not understand Git ahead/behind result.",
                output=output,
            )
        return int(parts[0]), int(parts[1])

    def state(self, repo_path: Path) -> RepoState:
        """Return the current local/upstream state."""
        branch = self.current_branch(repo_path)
        commits = self.has_commits(repo_path)
        upstream = self.has_upstream(repo_path) if commits else False

        ahead = 0
        behind = 0
        if branch and upstream:
            ahead, behind = self.ahead_behind(repo_path)

        return RepoState(
            name=repo_path.name,
            branch=branch,
            has_local_changes=self.has_local_changes(repo_path),
            ahead=ahead,
            behind=behind,
            has_upstream=upstream,
            has_commits=commits,
        )

    def changed_paths(self, repo_path: Path) -> list[str]:
        """Return paths currently changed in the working tree/index."""
        output = self.run(repo_path, "status", "--porcelain=v1", "-z")
        if not output:
            return []

        entries = output.split("\0")
        paths: list[str] = []
        index = 0

        while index < len(entries):
            entry = entries[index]
            if not entry:
                index += 1
                continue

            status = entry[:2]
            path = entry[3:] if len(entry) >= 4 else ""

            if "R" in status or "C" in status:
                if path:
                    paths.append(path)
                if index + 1 < len(entries) and entries[index + 1]:
                    paths.append(entries[index + 1])
                    index += 1
            elif path:
                paths.append(path)

            index += 1

        return paths

    def find_sensitive_changed_files(self, repo_path: Path) -> list[str]:
        """Block common credential and secret files from automatic commits."""
        sensitive: list[str] = []

        for changed_path in self.changed_paths(repo_path):
            name = Path(changed_path).name.lower()
            suffix = Path(changed_path).suffix.lower()

            if (
                name in self.SECRET_FILE_NAMES
                or name.startswith(".env.")
                or suffix in self.SECRET_SUFFIXES
            ):
                sensitive.append(changed_path)

        return sorted(set(sensitive))

    def ensure_standard_ignores(self, repo_path: Path) -> None:
        """
        Ensure common local-only files are ignored by each managed repository.

        Child repositories have their own .gitignore. The parent GithubAuto
        .gitignore cannot protect files inside independent child repositories.
        """
        gitignore = repo_path / ".gitignore"
        existing = ""

        if gitignore.exists():
            existing = gitignore.read_text(
                encoding="utf-8",
                errors="replace",
            )

        required_lines = [
            ".env",
            ".env.*",
            "!.env.example",
            ".DS_Store",
            "Thumbs.db",
            "__pycache__/",
            "*.pyc",
        ]

        existing_lines = {line.strip() for line in existing.splitlines()}
        missing = [
            line
            for line in required_lines
            if line not in existing_lines
        ]

        if missing:
            with gitignore.open("a", encoding="utf-8") as file:
                if existing and not existing.endswith("\n"):
                    file.write("\n")

                if existing and existing.strip():
                    file.write("\n")

                file.write("# Local-only files\n")

                for line in missing:
                    file.write(f"{line}\n")

        self.untrack_ds_store(repo_path)

    def untrack_ds_store(self, repo_path: Path) -> None:
        """
        Remove already-tracked .DS_Store files from Git's index.

        Files remain on disk and are ignored after this cleanup.
        """
        output = self.run(repo_path, "ls-files", "-z")

        tracked_paths = [
            path
            for path in output.split("\0")
            if path and Path(path).name == ".DS_Store"
        ]

        for path in tracked_paths:
            self.run(
                repo_path,
                "rm",
                "--cached",
                "--ignore-unmatch",
                "--",
                path,
            )

    def working_diff_for_llm(self, repo_path: Path, max_chars: int = 12000) -> str:
        """Build a compact description of current changes for the local LLM."""
        if self.has_commits(repo_path):
            stat = self.run(repo_path, "diff", "HEAD", "--stat")
            diff = self.run(repo_path, "diff", "HEAD", "--unified=0")
        else:
            stat = ""
            diff = ""

        untracked = self.run(
            repo_path,
            "ls-files",
            "--others",
            "--exclude-standard",
        )

        sections = []
        if stat:
            sections.append(f"Changed files summary:\n{stat}")
        if diff:
            sections.append(f"Tracked changes:\n{diff}")
        if untracked:
            sections.append(f"Untracked files:\n{untracked}")

        combined = "\n\n".join(sections).strip()
        if len(combined) > max_chars:
            combined = combined[:max_chars] + "\n...[diff truncated]"
        return combined

    def stage_all(self, repo_path: Path) -> None:
        """Stage all safe repository changes."""
        self.run(repo_path, "add", "-A")

    def has_staged_changes(self, repo_path: Path) -> bool:
        """Return True when staging contains something to commit."""
        completed = subprocess.run(
            ["git", "diff", "--cached", "--quiet"],
            cwd=repo_path,
            env=self._git_environment(),
            capture_output=True,
            check=False,
        )
        return completed.returncode == 1

    def commit(self, repo_path: Path, message: str) -> None:
        """Create a Git commit."""
        self.run(repo_path, "commit", "-m", message)

    def pull_fast_forward(self, repo_path: Path) -> None:
        """Fast-forward a branch whose remote is ahead."""
        self.run(repo_path, "pull", "--ff-only")

    def merge_upstream(self, repo_path: Path) -> None:
        """Merge the configured upstream into the current branch."""
        self.run(repo_path, "merge", "--no-edit", "@{upstream}")

    def abort_merge(self, repo_path: Path) -> None:
        """Abort an in-progress merge."""
        self.run(repo_path, "merge", "--abort", check=False)

    def conflicted_files(self, repo_path: Path) -> list[str]:
        """Return unresolved merge-conflict paths."""
        output = self.run(
            repo_path,
            "diff",
            "--name-only",
            "--diff-filter=U",
            check=False,
        )
        return [line.strip() for line in output.splitlines() if line.strip()]

    def push(self, repo_path: Path, remote_name: str, branch: str) -> None:
        """Push and create upstream tracking when needed."""
        if self.has_upstream(repo_path):
            self.run(repo_path, "push")
        else:
            self.run(repo_path, "push", "-u", remote_name, branch)

    def in_progress_operation(self, repo_path: Path) -> str | None:
        """Detect unfinished merge/rebase/cherry-pick/revert operations."""
        git_dir_text = self.run(repo_path, "rev-parse", "--git-dir")
        git_dir = Path(git_dir_text)
        if not git_dir.is_absolute():
            git_dir = (repo_path / git_dir).resolve()

        markers = (
            ("merge", git_dir / "MERGE_HEAD"),
            ("cherry-pick", git_dir / "CHERRY_PICK_HEAD"),
            ("revert", git_dir / "REVERT_HEAD"),
            ("rebase", git_dir / "rebase-merge"),
            ("rebase", git_dir / "rebase-apply"),
        )

        for operation, marker in markers:
            if marker.exists():
                return operation

        return None

    @staticmethod
    def folder_name_from_url(url: str) -> str:
        """Convert a Git URL into a local folder name."""
        cleaned = url.rstrip("/")
        name = cleaned.split("/")[-1]
        if name.endswith(".git"):
            name = name[:-4]
        if not name:
            raise ValueError(f"Could not determine folder name from URL: {url}")
        return name
