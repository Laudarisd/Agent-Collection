from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class FileChange:
    """One changed path reported by Git status."""

    path: str
    index_status: str
    worktree_status: str
    original_path: str | None = None

    @property
    def is_untracked(self) -> bool:
        return self.index_status == "?" and self.worktree_status == "?"

    @property
    def is_staged(self) -> bool:
        return self.index_status not in {" ", "?"}

    @property
    def is_unstaged(self) -> bool:
        return self.worktree_status not in {" ", "?"}

    @property
    def short_status(self) -> str:
        if self.is_untracked:
            return "UNTRACKED"

        labels: list[str] = []
        if self.is_staged:
            labels.append(f"staged:{self.index_status}")
        if self.is_unstaged:
            labels.append(f"worktree:{self.worktree_status}")
        return ", ".join(labels) or "changed"


@dataclass
class RepoReport:
    """Snapshot of one local repository and its remote relationship."""

    path: Path
    name: str
    is_git_repo: bool
    branch: str = ""
    has_commits: bool = False
    remote_name: str = "origin"
    remote_url: str = ""
    remote_exists: bool = False
    remote_ok: bool = False
    remote_error: str = ""
    has_upstream: bool = False
    ahead: int = 0
    behind: int = 0
    changes: list[FileChange] = field(default_factory=list)
    operation_in_progress: str = ""
    scan_error: str = ""

    @property
    def has_local_changes(self) -> bool:
        return bool(self.changes)

    @property
    def changed_file_count(self) -> int:
        return len(self.changes)

    @property
    def is_diverged(self) -> bool:
        return self.ahead > 0 and self.behind > 0

    @property
    def needs_attention(self) -> bool:
        if not self.is_git_repo:
            return True
        if self.scan_error or self.operation_in_progress:
            return True
        if not self.remote_exists or not self.remote_ok:
            return True
        if self.has_local_changes:
            return True
        if self.ahead > 0 or self.behind > 0:
            return True
        if self.has_commits and not self.has_upstream:
            return True
        return False

    def recommendation(self, preferred_strategy: str = "rebase") -> str:
        """Return a plain-English next action based on the current state."""
        if not self.is_git_repo:
            return "Initialize Git and connect/create a remote"

        if self.operation_in_progress:
            return f"Finish or abort current {self.operation_in_progress}"

        if self.scan_error:
            return "Inspect repository error"

        if not self.remote_exists:
            return "Connect or create GitHub remote"

        if not self.remote_ok:
            return "Repair remote URL or create missing GitHub repository"

        if not self.has_commits and self.has_local_changes:
            return "Commit selected files, then push"

        if self.has_local_changes and self.behind > 0:
            return "Commit or stash local changes before integrating remote"

        if self.has_local_changes:
            return "Review changed files; commit only what you want"

        if self.is_diverged:
            if preferred_strategy == "merge":
                return "Merge remote changes, review, then push"
            return "Rebase local commits onto remote, review, then push"

        if self.behind > 0:
            return "Fast-forward pull"

        if self.ahead > 0:
            return "Push existing local commit(s)"

        if self.has_commits and not self.has_upstream:
            return "Push branch and create upstream tracking"

        return "No action needed"
