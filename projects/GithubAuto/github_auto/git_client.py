from __future__ import annotations

import base64
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from github_auto.models import FileChange


class GitCommandError(RuntimeError):
    """Raised when a Git command fails."""

    def __init__(
        self,
        message: str,
        output: str = "",
        returncode: int | None = None,
    ) -> None:
        super().__init__(message)
        self.output = output
        self.returncode = returncode


@dataclass(frozen=True)
class GitResult:
    returncode: int
    stdout: str
    stderr: str


class GitClient:
    """Small, explicit wrapper around normal Git commands."""

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

    def _environment(self) -> dict[str, str]:
        """
        Build the environment for Git subprocesses.

        Existing macOS Git Credential Manager / SSH authentication continues
        to work. When GITHUB_TOKEN exists, HTTPS GitHub requests may also use
        it without writing the token into a remote URL.
        """
        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"

        if self.github_token:
            raw = f"x-access-token:{self.github_token}".encode("utf-8")
            encoded = base64.b64encode(raw).decode("ascii")

            env["GIT_CONFIG_COUNT"] = "1"
            env["GIT_CONFIG_KEY_0"] = (
                "http.https://github.com/.extraheader"
            )
            env["GIT_CONFIG_VALUE_0"] = (
                f"AUTHORIZATION: basic {encoded}"
            )

        return env

    def execute(
        self,
        repo_path: Path | None,
        *args: str,
        check: bool = True,
    ) -> GitResult:
        """Run Git and return stdout, stderr, and return code."""
        try:
            result = subprocess.run(
                ["git", *args],
                cwd=repo_path,
                env=self._environment(),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                "Git is not installed or is not available in PATH."
            ) from exc

        git_result = GitResult(
            returncode=result.returncode,
            # Preserve stdout exactly. Git porcelain formats use leading
            # spaces as meaningful status characters.
            stdout=result.stdout,
            stderr=result.stderr.strip(),
        )

        if check and result.returncode != 0:
            raise GitCommandError(
                f"Git command failed: git {' '.join(args)}",
                output=git_result.stderr or git_result.stdout,
                returncode=result.returncode,
            )

        return git_result

    def run(
        self,
        repo_path: Path | None,
        *args: str,
        check: bool = True,
    ) -> str:
        return self.execute(
            repo_path,
            *args,
            check=check,
        ).stdout

    # ------------------------------------------------------------------
    # Repository basics
    # ------------------------------------------------------------------

    def is_git_repo(self, path: Path) -> bool:
        if not path.is_dir():
            return False

        result = self.execute(
            path,
            "rev-parse",
            "--is-inside-work-tree",
            check=False,
        )
        return (
            result.returncode == 0
            and result.stdout.strip().lower() == "true"
        )

    def init_repository(self, path: Path, branch: str = "main") -> None:
        self.run(path, "init", "-b", branch)

    def has_commits(self, repo_path: Path) -> bool:
        result = self.execute(
            repo_path,
            "rev-parse",
            "--verify",
            "HEAD",
            check=False,
        )
        return result.returncode == 0

    def current_branch(self, repo_path: Path) -> str:
        branch = self.run(
            repo_path,
            "branch",
            "--show-current",
            check=False,
        ).strip()
        if branch:
            return branch

        return self.run(
            repo_path,
            "symbolic-ref",
            "--short",
            "HEAD",
            check=False,
        ).strip()

    def in_progress_operation(self, repo_path: Path) -> str:
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

        for name, marker in markers:
            if marker.exists():
                return name

        return ""

    # ------------------------------------------------------------------
    # Remote and comparison
    # ------------------------------------------------------------------

    def remote_exists(self, repo_path: Path, remote_name: str) -> bool:
        names = {
            line.strip()
            for line in self.run(
                repo_path,
                "remote",
                check=False,
            ).splitlines()
            if line.strip()
        }
        return remote_name in names

    def get_remote_url(self, repo_path: Path, remote_name: str) -> str:
        return self.run(
            repo_path,
            "remote",
            "get-url",
            remote_name,
        ).strip()

    def add_remote(
        self,
        repo_path: Path,
        remote_name: str,
        url: str,
    ) -> None:
        self.run(repo_path, "remote", "add", remote_name, url)

    def set_remote_url(
        self,
        repo_path: Path,
        remote_name: str,
        url: str,
    ) -> None:
        self.run(repo_path, "remote", "set-url", remote_name, url)

    def remove_remote(
        self,
        repo_path: Path,
        remote_name: str,
    ) -> None:
        self.run(repo_path, "remote", "remove", remote_name)

    def fetch(
        self,
        repo_path: Path,
        remote_name: str,
    ) -> None:
        self.run(repo_path, "fetch", "--prune", remote_name)

    def has_upstream(self, repo_path: Path) -> bool:
        result = self.execute(
            repo_path,
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
            check=False,
        )
        return result.returncode == 0 and bool(result.stdout.strip())

    def ahead_behind(self, repo_path: Path) -> tuple[int, int]:
        output = self.run(
            repo_path,
            "rev-list",
            "--left-right",
            "--count",
            "HEAD...@{upstream}",
        )
        pieces = output.replace("\t", " ").split()

        if len(pieces) != 2:
            raise GitCommandError(
                "Could not parse Git ahead/behind result.",
                output=output,
            )

        return int(pieces[0]), int(pieces[1])

    # ------------------------------------------------------------------
    # Working tree
    # ------------------------------------------------------------------

    def changes(self, repo_path: Path) -> list[FileChange]:
        """
        Parse `git status --porcelain=v1 -z`.

        The two status characters mean:
        X = index/staged state
        Y = working-tree state
        """
        output = self.run(
            repo_path,
            "status",
            "--porcelain=v1",
            "-z",
        )

        if not output:
            return []

        entries = output.split("\0")
        result: list[FileChange] = []
        index = 0

        while index < len(entries):
            entry = entries[index]
            if not entry:
                index += 1
                continue

            if len(entry) < 4:
                index += 1
                continue

            x = entry[0]
            y = entry[1]
            path = entry[3:]
            original_path: str | None = None

            # Porcelain -z returns an additional pathname for rename/copy.
            if x in {"R", "C"} or y in {"R", "C"}:
                if index + 1 < len(entries) and entries[index + 1]:
                    original_path = path
                    path = entries[index + 1]
                    index += 1

            result.append(
                FileChange(
                    path=path,
                    index_status=x,
                    worktree_status=y,
                    original_path=original_path,
                )
            )
            index += 1

        return result

    def changed_paths(self, repo_path: Path) -> list[str]:
        return [change.path for change in self.changes(repo_path)]

    def sensitive_paths(
        self,
        repo_path: Path,
        selected_paths: list[str] | None = None,
    ) -> list[str]:
        paths = selected_paths or self.changed_paths(repo_path)
        sensitive: list[str] = []

        for raw_path in paths:
            path = Path(raw_path)
            name = path.name.lower()
            suffix = path.suffix.lower()

            if (
                name in self.SECRET_FILE_NAMES
                or name.startswith(".env.")
                or suffix in self.SECRET_SUFFIXES
            ):
                sensitive.append(raw_path)

        return sorted(set(sensitive))

    def stage_files(
        self,
        repo_path: Path,
        paths: list[str],
    ) -> None:
        if not paths:
            return
        self.run(repo_path, "add", "--", *paths)

    def stage_all(self, repo_path: Path) -> None:
        self.run(repo_path, "add", "-A")

    def unstage_files(
        self,
        repo_path: Path,
        paths: list[str],
    ) -> None:
        if not paths:
            return

        if self.has_commits(repo_path):
            self.run(repo_path, "restore", "--staged", "--", *paths)
        else:
            self.run(
                repo_path,
                "rm",
                "--cached",
                "--ignore-unmatch",
                "--",
                *paths,
                check=False,
            )

    def staged_paths(self, repo_path: Path) -> list[str]:
        """Return paths already staged before a new operation starts."""
        output = self.run(
            repo_path,
            "diff",
            "--cached",
            "--name-only",
            "-z",
        )
        return [
            path
            for path in output.split("\0")
            if path
        ]

    def has_staged_changes(self, repo_path: Path) -> bool:
        result = self.execute(
            repo_path,
            "diff",
            "--cached",
            "--quiet",
            check=False,
        )
        return result.returncode == 1

    def diff(
        self,
        repo_path: Path,
        paths: list[str] | None = None,
        staged: bool = False,
        max_chars: int = 20000,
    ) -> str:
        args = ["diff"]
        if staged:
            args.append("--cached")

        if paths:
            args.extend(["--", *paths])

        text = self.run(repo_path, *args, check=False)
        if len(text) > max_chars:
            return text[:max_chars] + "\n...[diff truncated]"
        return text

    def diff_summary_for_llm(
        self,
        repo_path: Path,
        paths: list[str],
        max_chars: int = 12000,
    ) -> str:
        """
        Describe selected changes without staging them first.

        This keeps the user's existing Git index unchanged if the model fails.
        """
        sections: list[str] = []

        if self.has_commits(repo_path):
            stat_args = ["diff", "HEAD", "--stat", "--", *paths]
            diff_args = [
                "diff",
                "HEAD",
                "--unified=0",
                "--",
                *paths,
            ]
            stat = self.run(repo_path, *stat_args, check=False)
            patch = self.run(repo_path, *diff_args, check=False)

            if stat:
                sections.append(f"Changed files:\n{stat}")
            if patch:
                sections.append(f"Tracked changes:\n{patch}")

        untracked = {
            line.strip()
            for line in self.run(
                repo_path,
                "ls-files",
                "--others",
                "--exclude-standard",
            ).splitlines()
            if line.strip()
        }
        selected_untracked = [
            path for path in paths if path in untracked
        ]
        if selected_untracked:
            sections.append(
                "New untracked files:\n"
                + "\n".join(selected_untracked)
            )

        combined = "\n\n".join(sections).strip()

        if not combined:
            combined = "Selected changed paths:\n" + "\n".join(paths)

        if len(combined) > max_chars:
            combined = (
                combined[:max_chars]
                + "\n...[change description truncated]"
            )

        return combined

    def commit(self, repo_path: Path, message: str) -> None:
        """Commit everything currently staged."""
        self.run(repo_path, "commit", "-m", message)

    def commit_selected(
        self,
        repo_path: Path,
        message: str,
        paths: list[str],
    ) -> None:
        """
        Commit only selected paths.

        In an established repository, `--only` prevents unrelated files that
        were already staged by the user from leaking into this commit.
        """
        if not paths:
            raise ValueError("No paths were selected for commit.")

        if self.has_commits(repo_path):
            self.run(
                repo_path,
                "commit",
                "--only",
                "-m",
                message,
                "--",
                *paths,
            )
        else:
            # Initial commit has no parent/index baseline. Selected paths were
            # staged immediately before this call.
            self.run(
                repo_path,
                "commit",
                "-m",
                message,
                "--",
                *paths,
            )

    def restore_files(
        self,
        repo_path: Path,
        paths: list[str],
    ) -> tuple[list[str], list[str]]:
        """
        Discard tracked modifications for selected paths.

        Returns:
            (restored_paths, skipped_new_paths)

        Newly added/untracked files are never silently deleted.
        """
        restored: list[str] = []
        skipped_new: list[str] = []

        for path in paths:
            # Is this path present in HEAD? If not, deleting/restoring it could
            # remove a newly created file, so leave it for explicit deletion.
            in_head = self.execute(
                repo_path,
                "cat-file",
                "-e",
                f"HEAD:{path}",
                check=False,
            )

            if in_head.returncode != 0:
                skipped_new.append(path)
                continue

            # Restore both index and working tree from HEAD.
            self.run(
                repo_path,
                "restore",
                "--source=HEAD",
                "--staged",
                "--worktree",
                "--",
                path,
            )
            restored.append(path)

        return restored, skipped_new

    def delete_local_file(
        self,
        repo_path: Path,
        relative_path: str,
    ) -> None:
        """Delete one file inside the repository, never outside it."""
        repo_root = repo_path.resolve()
        target = (repo_path / relative_path).resolve()

        try:
            target.relative_to(repo_root)
        except ValueError as exc:
            raise ValueError(
                "Refusing to delete a path outside this repository."
            ) from exc

        if not target.exists():
            raise FileNotFoundError(f"File does not exist: {relative_path}")

        if target.is_dir():
            raise IsADirectoryError(
                "This action deletes files only, not directories."
            )

        target.unlink()

    # ------------------------------------------------------------------
    # Pull / merge / rebase / push
    # ------------------------------------------------------------------

    def pull_fast_forward(self, repo_path: Path) -> None:
        self.run(repo_path, "pull", "--ff-only")

    def rebase_upstream(self, repo_path: Path) -> None:
        self.run(repo_path, "rebase", "@{upstream}")

    def abort_rebase(self, repo_path: Path) -> None:
        self.run(repo_path, "rebase", "--abort", check=False)

    def merge_upstream(self, repo_path: Path) -> None:
        self.run(repo_path, "merge", "--no-edit", "@{upstream}")

    def abort_merge(self, repo_path: Path) -> None:
        self.run(repo_path, "merge", "--abort", check=False)

    def conflicted_files(self, repo_path: Path) -> list[str]:
        output = self.run(
            repo_path,
            "diff",
            "--name-only",
            "--diff-filter=U",
            check=False,
        )
        return [
            line.strip()
            for line in output.splitlines()
            if line.strip()
        ]

    def push_current_branch(
        self,
        repo_path: Path,
        remote_name: str,
    ) -> None:
        branch = self.current_branch(repo_path)
        if not branch:
            raise GitCommandError(
                "Cannot push while HEAD is detached."
            )

        if self.has_upstream(repo_path):
            self.run(repo_path, "push")
        else:
            self.run(
                repo_path,
                "push",
                "-u",
                remote_name,
                branch,
            )

    # ------------------------------------------------------------------
    # Branches
    # ------------------------------------------------------------------

    def local_branches(self, repo_path: Path) -> list[str]:
        output = self.run(
            repo_path,
            "for-each-ref",
            "--format=%(refname:short)",
            "refs/heads/",
        )
        return [
            line.strip()
            for line in output.splitlines()
            if line.strip()
        ]

    def remote_branches(
        self,
        repo_path: Path,
        remote_name: str,
    ) -> list[str]:
        output = self.run(
            repo_path,
            "for-each-ref",
            "--format=%(refname:short)",
            f"refs/remotes/{remote_name}/",
        )
        return [
            line.strip()
            for line in output.splitlines()
            if line.strip()
            and not line.strip().endswith("/HEAD")
        ]

    def create_branch(
        self,
        repo_path: Path,
        branch_name: str,
        switch: bool = True,
    ) -> None:
        self._validate_branch_name(branch_name)

        if switch:
            self.run(repo_path, "switch", "-c", branch_name)
        else:
            self.run(repo_path, "branch", branch_name)

    def switch_branch(
        self,
        repo_path: Path,
        branch_name: str,
    ) -> None:
        self._validate_branch_name(branch_name)
        self.run(repo_path, "switch", branch_name)

    def delete_local_branch(
        self,
        repo_path: Path,
        branch_name: str,
        force: bool = False,
    ) -> None:
        self._validate_branch_name(branch_name)
        flag = "-D" if force else "-d"
        self.run(repo_path, "branch", flag, branch_name)

    def delete_remote_branch(
        self,
        repo_path: Path,
        remote_name: str,
        branch_name: str,
    ) -> None:
        self._validate_branch_name(branch_name)
        self.run(
            repo_path,
            "push",
            remote_name,
            "--delete",
            branch_name,
        )

    def merge_branch(
        self,
        repo_path: Path,
        branch_name: str,
    ) -> None:
        self._validate_branch_name(branch_name)
        self.run(repo_path, "merge", "--no-edit", branch_name)

    def rebase_onto_branch(
        self,
        repo_path: Path,
        branch_name: str,
    ) -> None:
        self._validate_branch_name(branch_name)
        self.run(repo_path, "rebase", branch_name)

    @staticmethod
    def _validate_branch_name(branch_name: str) -> None:
        name = branch_name.strip()
        if not name:
            raise ValueError("Branch name cannot be empty.")

        if any(char.isspace() for char in name):
            raise ValueError("Branch name cannot contain whitespace.")

    # ------------------------------------------------------------------
    # History / recovery
    # ------------------------------------------------------------------

    def recent_commits(
        self,
        repo_path: Path,
        limit: int,
    ) -> list[str]:
        output = self.run(
            repo_path,
            "log",
            f"-n{limit}",
            "--date=short",
            "--pretty=format:%h | %ad | %s",
            check=False,
        )
        return [
            line.rstrip()
            for line in output.splitlines()
            if line.strip()
        ]

    def revert_commit(
        self,
        repo_path: Path,
        commit_ref: str,
    ) -> None:
        self.run(repo_path, "revert", "--no-edit", commit_ref)

    def reset_soft(
        self,
        repo_path: Path,
        commit_ref: str,
    ) -> None:
        self.run(repo_path, "reset", "--soft", commit_ref)

    def reset_mixed(
        self,
        repo_path: Path,
        commit_ref: str,
    ) -> None:
        self.run(repo_path, "reset", "--mixed", commit_ref)

    def reset_hard(
        self,
        repo_path: Path,
        commit_ref: str,
    ) -> None:
        self.run(repo_path, "reset", "--hard", commit_ref)

    # ------------------------------------------------------------------
    # Stash
    # ------------------------------------------------------------------

    def stash_save(
        self,
        repo_path: Path,
        message: str,
        include_untracked: bool = True,
    ) -> None:
        args = ["stash", "push"]
        if include_untracked:
            args.append("-u")

        if message.strip():
            args.extend(["-m", message.strip()])

        self.run(repo_path, *args)

    def stash_list(self, repo_path: Path) -> list[str]:
        output = self.run(repo_path, "stash", "list")
        return [
            line.rstrip()
            for line in output.splitlines()
            if line.strip()
        ]

    def stash_apply(
        self,
        repo_path: Path,
        stash_ref: str,
    ) -> None:
        self.run(repo_path, "stash", "apply", stash_ref)

    def stash_pop(
        self,
        repo_path: Path,
        stash_ref: str,
    ) -> None:
        self.run(repo_path, "stash", "pop", stash_ref)

    def stash_drop(
        self,
        repo_path: Path,
        stash_ref: str,
    ) -> None:
        self.run(repo_path, "stash", "drop", stash_ref)

    # ------------------------------------------------------------------
    # Clone / delete local repository
    # ------------------------------------------------------------------

    def clone(self, url: str, destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        self.run(None, "clone", url, str(destination))

    @staticmethod
    def delete_local_repository(repo_path: Path) -> None:
        shutil.rmtree(repo_path)

    @staticmethod
    def folder_name_from_url(url: str) -> str:
        cleaned = url.rstrip("/")
        name = cleaned.split("/")[-1]
        if name.endswith(".git"):
            name = name[:-4]

        if not name:
            raise ValueError("Could not determine repository name from URL.")

        return name

    @staticmethod
    def parse_github_remote(url: str) -> tuple[str, str] | None:
        """
        Parse common GitHub HTTPS and SSH remote URL forms.

        Examples:
          https://github.com/owner/repo.git
          git@github.com:owner/repo.git
        """
        patterns = (
            r"^https://github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$",
            r"^git@github\.com:([^/]+)/(.+?)(?:\.git)?$",
            r"^ssh://git@github\.com/([^/]+)/(.+?)(?:\.git)?$",
        )

        for pattern in patterns:
            match = re.match(pattern, url.strip())
            if match:
                return match.group(1), match.group(2)

        return None
