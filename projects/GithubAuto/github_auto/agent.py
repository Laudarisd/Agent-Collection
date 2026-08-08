from __future__ import annotations

import os
from pathlib import Path

from github_auto.config import AppConfig
from github_auto.git_client import GitClient, GitCommandError, RepoState
from github_auto.github_client import GitHubAPIError, GitHubClient
from github_auto.llm import LocalLLM


class GitHubAutoAgent:
    """
    Coordinate local repositories and GitHub.

    Git decides repository state. The local LLM is restricted to generating
    commit messages; it never invents shell commands or conflict resolutions.
    """

    def __init__(self, config: AppConfig) -> None:
        self.config = config

        token = os.getenv("GITHUB_TOKEN")
        owner = os.getenv("GITHUB_OWNER")

        self.git = GitClient(token)
        self.github = GitHubClient(
            token=token,
            owner=owner,
            timeout_seconds=config.github.api_timeout_seconds,
        )
        self.llm = LocalLLM(config.llm)

    def run(self, sync: bool) -> None:
        """Inspect or synchronize every project inside repo_dir."""
        print(f"\nLocal model: {self.llm.model_status()}")
        print(f"Repository folder: {self.config.repo_dir}")

        self._clone_missing_configured_repositories()

        projects = self._discover_projects()
        if not projects:
            print("\nNo projects were found.")
            return

        action = "Synchronizing" if sync else "Checking"
        print(f"\n{action} {len(projects)} project(s).\n")

        for project_path in projects:
            self._process_project(project_path, sync)

        print("\nFinished.")

    def _clone_missing_configured_repositories(self) -> None:
        """Clone explicitly configured remote repositories when absent."""
        for url in self.config.repositories:
            destination = (
                self.config.repo_dir / self.git.folder_name_from_url(url)
            )

            if destination.exists():
                continue

            print(f"Cloning {destination.name}...")
            try:
                self.git.clone(url, destination)
            except Exception as exc:
                print(f"  ERROR: Could not clone {url}")
                self._print_exception(exc)

    def _discover_projects(self) -> list[Path]:
        """Return every direct child folder inside repo_dir."""
        return sorted(
            path
            for path in self.config.repo_dir.iterdir()
            if path.is_dir() and not path.name.startswith(".")
        )

    def _process_project(self, repo_path: Path, sync: bool) -> None:
        """Inspect one local folder/repository."""
        print(f"[{repo_path.name}]")

        try:
            if not self.git.is_git_repo(repo_path):
                if not sync:
                    print("  Local folder exists but Git is not initialized.")
                    return

                if not self.config.github.initialize_plain_folders:
                    print("  SKIPPED: Git initialization is disabled.")
                    return

                print("  Initializing local Git repository on branch main...")
                self.git.init_repository(repo_path, branch="main")

            # Child repositories need their own .gitignore protection.
            self.git.ensure_standard_ignores(repo_path)

            operation = self.git.in_progress_operation(repo_path)
            if operation:
                print(
                    f"  SKIPPED: Unfinished Git {operation} operation exists. "
                    "Finish or abort it manually."
                )
                return

            remote_name = self.config.github.remote_name
            has_remote = self.git.remote_exists(repo_path, remote_name)

            if not has_remote:
                if not sync:
                    print(f"  No '{remote_name}' remote configured.")
                    self._print_local_state_without_remote(repo_path)
                    return

                if not self.config.github.create_remote_if_missing:
                    print("  No GitHub remote and automatic creation is disabled.")
                    return

                if not self._create_or_connect_remote(repo_path):
                    return

            # Fetch only after a remote is known to exist.
            self.git.fetch(repo_path, remote_name)

            initial_state = self.git.state(repo_path)
            self._print_state(initial_state)

            if not sync:
                return

            if initial_state.has_local_changes and self.config.git.auto_commit:
                if not self._commit_local_changes(repo_path):
                    return

            state = self.git.state(repo_path)

            if not state.has_commits:
                print("  Repository has no commit yet; nothing can be pushed.")
                return

            if not state.has_upstream:
                if self.config.git.auto_push:
                    print("  Creating upstream branch with push...")
                    self.git.push(repo_path, remote_name, state.branch)
                    print("  PUSHED.")
                else:
                    print("  No upstream branch and auto_push is disabled.")
                return

            if state.ahead == 0 and state.behind == 0:
                if state.has_local_changes:
                    print("  Local changes remain; remote is otherwise synchronized.")
                else:
                    print("  Already synchronized.")
                return

            if state.behind > 0 and state.ahead == 0:
                self._handle_behind_only(repo_path)
                return

            if state.ahead > 0 and state.behind == 0:
                self._handle_ahead_only(repo_path, state)
                return

            if state.ahead > 0 and state.behind > 0:
                self._handle_diverged(repo_path)

        except Exception as exc:
            print("  ERROR:")
            self._print_exception(exc)

    def _create_or_connect_remote(self, repo_path: Path) -> bool:
        """Create the corresponding GitHub repository and add origin."""
        if not self.github.is_configured():
            print(
                "  STOPPED: This local repository has no GitHub remote.\n"
                "  Put GITHUB_TOKEN in GithubAuto/.env so the agent can create it."
            )
            return False

        print(
            f"  Creating/checking GitHub repository '{repo_path.name}' "
            f"as {self.config.github.default_visibility}..."
        )

        try:
            remote, created = self.github.create_or_get_repository(
                name=repo_path.name,
                visibility=self.config.github.default_visibility,
            )
        except GitHubAPIError as exc:
            print(f"  STOPPED: {exc}")
            return False

        self.git.add_remote(
            repo_path,
            self.config.github.remote_name,
            remote.clone_url,
        )

        if created:
            print(f"  CREATED REMOTE: {remote.html_url}")
        else:
            print(f"  EXISTING REMOTE FOUND: {remote.html_url}")

        print(
            f"  Added Git remote '{self.config.github.remote_name}': "
            f"{remote.clone_url}"
        )
        return True

    def _commit_local_changes(self, repo_path: Path) -> bool:
        """Commit safe local changes using the local LLM for the subject."""
        sensitive = self.git.find_sensitive_changed_files(repo_path)
        if sensitive:
            print("  STOPPED: Potential secret files are present:")
            for path in sensitive:
                print(f"    - {path}")
            return False

        if not self.llm.is_configured():
            print(
                f"  STOPPED: Local model was not found:\n"
                f"  {self.config.llm.model_path}"
            )
            return False

        diff_summary = self.git.working_diff_for_llm(repo_path)
        if not diff_summary:
            print("  No committable changes were found.")
            return True

        print("  Asking local Qwen/llama.cpp for a commit message...")
        try:
            commit_message = self.llm.create_commit_message(
                repo_name=repo_path.name,
                diff_summary=diff_summary,
            )
            print(f"  Commit message: {commit_message}")
        except RuntimeError as exc:
            # Git synchronization should not stop only because generation
            # output could not be captured. Use a deterministic safe fallback.
            print(f"  LLM warning: {exc}")
            commit_message = self._fallback_commit_message(repo_path)
            print(f"  Fallback commit message: {commit_message}")

        self.git.stage_all(repo_path)

        if not self.git.has_staged_changes(repo_path):
            print("  Nothing was staged.")
            return True

        self.git.commit(repo_path, commit_message)
        print("  COMMITTED.")
        return True

    def _handle_behind_only(self, repo_path: Path) -> None:
        """Fast-forward pull when only the remote branch is ahead."""
        if not self.config.git.auto_pull:
            print("  Remote is ahead, but auto_pull is disabled.")
            return

        if self.git.has_local_changes(repo_path):
            print("  STOPPED: Uncommitted local changes remain before pull.")
            return

        print("  Remote is ahead. Fast-forward pulling...")
        self.git.pull_fast_forward(repo_path)
        print("  PULLED.")

    def _handle_ahead_only(
        self,
        repo_path: Path,
        state: RepoState,
    ) -> None:
        """Push when only the local branch is ahead."""
        if not self.config.git.auto_push:
            print("  Local branch is ahead, but auto_push is disabled.")
            return

        if self.git.has_local_changes(repo_path):
            print("  STOPPED: Uncommitted local changes remain before push.")
            return

        print("  Local branch is ahead. Pushing...")
        self.git.push(
            repo_path,
            self.config.github.remote_name,
            state.branch,
        )
        print("  PUSHED.")

    def _handle_diverged(self, repo_path: Path) -> None:
        """Use Git for a normal merge; never let the LLM guess conflicts."""
        if not self.config.git.auto_merge:
            print("  Branches diverged; auto_merge is disabled.")
            return

        if self.git.has_local_changes(repo_path):
            print("  STOPPED: Uncommitted local changes remain before merge.")
            return

        print("  Local and remote branches diverged. Attempting Git merge...")

        try:
            self.git.merge_upstream(repo_path)
        except GitCommandError as exc:
            conflicts = self.git.conflicted_files(repo_path)
            self.git.abort_merge(repo_path)

            if conflicts:
                print("  MERGE CONFLICT. Merge was aborted.")
                for path in conflicts:
                    print(f"    - {path}")
            else:
                print("  Merge failed and was aborted.")
                if exc.output:
                    print(f"  {exc.output}")
            return

        print("  MERGED.")

        if self.config.git.auto_push:
            state = self.git.state(repo_path)
            print("  Pushing merged result...")
            self.git.push(
                repo_path,
                self.config.github.remote_name,
                state.branch,
            )
            print("  PUSHED.")

    def _print_local_state_without_remote(self, repo_path: Path) -> None:
        """Show basic local state when no GitHub remote exists."""
        state = self.git.state(repo_path)
        print(f"  Branch: {state.branch or '(not created yet)'}")
        print(
            "  Local changes: "
            f"{'yes' if state.has_local_changes else 'no'}"
        )
        print(f"  Local commits: {'yes' if state.has_commits else 'no'}")

    @staticmethod
    def _print_state(state: RepoState) -> None:
        """Print a compact repository status."""
        print(f"  Branch: {state.branch}")
        print(
            "  Local changes: "
            f"{'yes' if state.has_local_changes else 'no'}"
        )
        print(
            "  Upstream configured: "
            f"{'yes' if state.has_upstream else 'no'}"
        )

        if state.has_upstream:
            print(f"  Ahead: {state.ahead} | Behind: {state.behind}")

    def _fallback_commit_message(self, repo_path: Path) -> str:
        """
        Build a deterministic commit subject if the local LLM is unavailable.

        This keeps Git synchronization operational without letting the fallback
        invent repository content.
        """
        paths = self.git.changed_paths(repo_path)
        useful = [
            Path(path).name
            for path in paths
            if Path(path).name != ".DS_Store"
        ]

        if len(useful) == 1:
            return f"Update {useful[0]}"[:72]

        if 1 < len(useful) <= 3:
            names = ", ".join(useful)
            return f"Update {names}"[:72]

        return "Update repository files"

    @staticmethod
    def _print_exception(exc: Exception) -> None:
        """Print useful errors without a normal Python traceback."""
        print(f"  {exc}")
        if isinstance(exc, GitCommandError) and exc.output:
            print(f"  {exc.output}")
