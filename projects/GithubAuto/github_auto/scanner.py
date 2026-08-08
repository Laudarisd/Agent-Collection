from __future__ import annotations

from pathlib import Path

from github_auto.git_client import GitClient, GitCommandError
from github_auto.models import RepoReport


class RepositoryScanner:
    """
    Inspect every direct child of repo/.

    `refresh_remote=True` runs `git fetch --prune` when a valid-looking remote
    is configured. Fetch updates remote-tracking references but does not modify
    the working tree.
    """

    def __init__(
        self,
        git: GitClient,
        repo_dir: Path,
        remote_name: str,
    ) -> None:
        self.git = git
        self.repo_dir = repo_dir
        self.remote_name = remote_name

    def discover_projects(self) -> list[Path]:
        return sorted(
            path
            for path in self.repo_dir.iterdir()
            if path.is_dir() and not path.name.startswith(".")
        )

    def scan_all(
        self,
        refresh_remote: bool = True,
    ) -> list[RepoReport]:
        return [
            self.scan_one(
                path,
                refresh_remote=refresh_remote,
            )
            for path in self.discover_projects()
        ]

    def scan_one(
        self,
        path: Path,
        refresh_remote: bool = True,
    ) -> RepoReport:
        report = RepoReport(
            path=path,
            name=path.name,
            is_git_repo=self.git.is_git_repo(path),
            remote_name=self.remote_name,
        )

        if not report.is_git_repo:
            return report

        try:
            report.branch = self.git.current_branch(path)
            report.has_commits = self.git.has_commits(path)
            report.operation_in_progress = (
                self.git.in_progress_operation(path)
            )
            report.changes = self.git.changes(path)

            report.remote_exists = self.git.remote_exists(
                path,
                self.remote_name,
            )

            if not report.remote_exists:
                return report

            report.remote_url = self.git.get_remote_url(
                path,
                self.remote_name,
            )

            if refresh_remote:
                try:
                    self.git.fetch(path, self.remote_name)
                    report.remote_ok = True
                except GitCommandError as exc:
                    report.remote_ok = False
                    report.remote_error = exc.output or str(exc)
                    return report
            else:
                # We know the remote is configured but have not validated it.
                report.remote_ok = True

            if report.has_commits:
                report.has_upstream = self.git.has_upstream(path)

            if report.has_upstream:
                report.ahead, report.behind = self.git.ahead_behind(path)

        except Exception as exc:
            report.scan_error = str(exc)

        return report
