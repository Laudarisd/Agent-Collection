from __future__ import annotations

import os
import subprocess
from pathlib import Path

from github_auto.config import AppConfig
from github_auto.git_client import GitClient, GitCommandError
from github_auto.github_client import GitHubAPIError, GitHubClient
from github_auto.llm import LocalLLM
from github_auto.models import RepoReport
from github_auto.scanner import RepositoryScanner
from github_auto.ui import TerminalUI


class GitHubAutoAgent:
    """
    Interactive Git/GitHub manager.

    Design principle:
    1. Inspect first.
    2. Explain the state.
    3. Ask the user which operation to run.
    4. Change only the selected repository/files.
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
        self.scanner = RepositoryScanner(
            git=self.git,
            repo_dir=config.repo_dir,
            remote_name=config.github.remote_name,
        )
        self.ui = TerminalUI()

    # ==================================================================
    # Main application
    # ==================================================================

    def run(self) -> None:
        while True:
            self.ui.main_menu()
            choice = self.ui.read("\nChoose an option: ")

            if choice == "1":
                self.scan_all()
            elif choice == "2":
                self.smart_sync()
            elif choice == "3":
                self.repository_manager()
            elif choice == "4":
                self.create_import_menu()
            elif choice == "5":
                self.model_config_check()
            elif choice == "0":
                print("\nGoodbye.")
                return
            else:
                self.ui.warning("Please choose 0, 1, 2, 3, 4, or 5.")

    # ==================================================================
    # Scan
    # ==================================================================

    def scan_all(self) -> list[RepoReport]:
        self.ui.title("Scan & Compare")
        self.ui.info(
            "Refreshing valid remotes with `git fetch --prune`."
        )
        self.ui.info(
            "Fetch updates remote-tracking metadata only; it does not "
            "change your working files."
        )

        reports = self.scanner.scan_all(refresh_remote=True)

        self.ui.reports_table(
            reports,
            preferred_strategy=(
                self.config.git.preferred_divergence_strategy
            ),
        )

        self.ui.info(
            f"Scanned {len(reports)} project(s) under "
            f"{self.config.repo_dir}"
        )
        self.ui.pause()
        return reports

    # ==================================================================
    # Smart Sync
    # ==================================================================

    def smart_sync(self) -> None:
        while True:
            self.ui.title("Smart Sync Assistant")
            self.ui.info(
                "Nothing is pushed automatically. Select a repository, "
                "then choose the exact action."
            )

            reports = self.scanner.scan_all(refresh_remote=True)
            attention = self.ui.reports_table(
                reports,
                preferred_strategy=(
                    self.config.git.preferred_divergence_strategy
                ),
                only_attention=True,
            )

            if not attention:
                self.ui.pause()
                return

            report = self.ui.choose_report(attention)
            if report is None:
                return

            self.smart_actions(report)

    def smart_actions(self, report: RepoReport) -> None:
        while True:
            report = self.scanner.scan_one(
                report.path,
                refresh_remote=True,
            )
            self.ui.show_repo_details(
                report,
                self.config.git.preferred_divergence_strategy,
            )

            self.ui.section("Suggested actions")
            print(
                "  1. Run recommended safe action\n"
                "     Uses the current state to choose only the obvious "
                "next step. Destructive choices are never automatic.\n\n"
                "  2. Review / commit selected file(s)\n"
                "     Stage only the files you choose. Nothing else is "
                "included in that commit.\n\n"
                "  3. Commit & push selected file(s)\n"
                "     Git pushes commits, not files. This creates a commit "
                "containing only your selected changes, then pushes it.\n\n"
                "  4. Open full Repository Manager\n"
                "     Access fetch, pull, rebase, merge, branches, history, "
                "stash, delete, remote repair, etc.\n\n"
                "  0. Back"
            )

            choice = self.ui.read("\nChoose an action: ")

            if choice == "1":
                self._run_recommended(report)
                self.ui.pause()
            elif choice == "2":
                self._commit_selected(report.path, push=False)
                self.ui.pause()
            elif choice == "3":
                self._commit_selected(report.path, push=True)
                self.ui.pause()
            elif choice == "4":
                self.manage_repository(report.path)
                return
            elif choice == "0":
                return
            else:
                self.ui.warning("Choose 0, 1, 2, 3, or 4.")

    def _run_recommended(self, report: RepoReport) -> None:
        if not report.is_git_repo:
            self._initialize_existing_folder(report.path)
            return

        if report.operation_in_progress:
            self.ui.warning(
                f"A Git {report.operation_in_progress} is already in "
                "progress. Resolve/abort it from Repository Manager."
            )
            return

        if not report.remote_exists or not report.remote_ok:
            self.remote_manager(report.path)
            return

        # Mixed state: local files changed AND committed changes may
        # already be waiting to push.
        if report.has_local_changes and report.ahead > 0:
            self.ui.warning(
                f"This repository has {report.changed_file_count} uncommitted "
                f"file change(s) AND {report.ahead} committed change(s) "
                "already waiting to push."
            )
            self.ui.info(
                "Options:\n"
                "  - Push the existing commit(s) now; uncommitted files stay local.\n"
                "  - Commit selected/all local files first, then push everything together.\n"
                "  - Stash the local files temporarily."
            )
            return

        if report.has_local_changes and report.behind > 0:
            self.ui.warning(
                f"This repository has {report.changed_file_count} uncommitted "
                f"file change(s) while the remote is ahead by "
                f"{report.behind} commit(s)."
            )
            self.ui.info(
                "Commit or stash the local files first, then integrate the "
                "remote changes with fast-forward pull, rebase, or merge."
            )
            return

        if report.has_local_changes:
            self.ui.warning(
                f"This repository has {report.changed_file_count} uncommitted "
                "file change(s), but no committed changes are waiting to push."
            )
            self.ui.info(
                "Use 'Commit selected file(s)' or "
                "'Commit & push selected file(s)' to continue."
            )
            return

        if report.is_diverged:
            if (
                self.config.git.preferred_divergence_strategy
                == "rebase"
            ):
                self._rebase_upstream(report.path)
            else:
                self._merge_upstream(report.path)
            return

        if report.behind > 0:
            self._pull_ff(report.path)
            return

        if report.ahead > 0 or (
            report.has_commits and not report.has_upstream
        ):
            self._push_existing_commits(report.path)
            return

        self.ui.success("No action is required.")

    # ==================================================================
    # Repository Manager
    # ==================================================================

    def repository_manager(self) -> None:
        reports = self.scanner.scan_all(refresh_remote=True)

        visible = self.ui.reports_table(
            reports,
            preferred_strategy=(
                self.config.git.preferred_divergence_strategy
            ),
        )
        report = self.ui.choose_report(visible)

        if report is None:
            return

        if not report.is_git_repo:
            if self.ui.confirm(
                f"'{report.name}' is not a Git repository. Initialize it?"
            ):
                self._initialize_existing_folder(report.path)
            return

        self.manage_repository(report.path)

    def manage_repository(self, repo_path: Path) -> None:
        while True:
            report = self.scanner.scan_one(
                repo_path,
                refresh_remote=True,
            )
            self.ui.show_repo_details(
                report,
                self.config.git.preferred_divergence_strategy,
            )

            self._show_actionable_state_summary(report)

            self.ui.section("Synchronization")
            print(
                "  1. Fetch / refresh remote\n"
                "     Download remote metadata/commits without changing "
                "your working files.\n\n"
                "  2. Pull — fast-forward only\n"
                "     Safest pull. Updates local branch only when no merge "
                "or rebase is needed.\n\n"
                "  3. Rebase current branch onto upstream\n"
                "     Replays your local commits after the latest remote "
                "commits for a linear history.\n\n"
                "  4. Merge upstream into current branch\n"
                "     Combines local and remote history. May create a merge "
                "commit.\n\n"
                "  5. Push existing local commit(s)\n"
                "     Pushes commits already ahead of the remote. "
                "Uncommitted files are not pushed."
            )

            self.ui.section("Files & commits")
            print(
                "  6. Show changed files / diff\n"
                "  7. Commit selected file(s)\n"
                "  8. Commit & push selected file(s)\n"
                "  9. Commit all changed files\n"
                " 10. Commit & push all changed files\n"
                " 11. Discard selected tracked-file changes\n"
                " 12. Delete one local file"
            )

            self.ui.section("Branches & history")
            print(
                " 13. Branch manager\n"
                " 14. History / revert / reset\n"
                " 15. Stash manager"
            )

            self.ui.section("Remote & repository")
            print(
                " 16. Repair / create / replace remote\n"
                " 17. Repository hygiene (.gitignore suggestions)\n"
                " 18. Delete local repository\n"
                " 19. Delete remote GitHub repository"
            )

            print("\n  0. Back")

            choice = self.ui.read("\nChoose an action: ")

            try:
                if choice == "1":
                    self._fetch(repo_path)
                elif choice == "2":
                    self._pull_ff(repo_path)
                elif choice == "3":
                    self._rebase_upstream(repo_path)
                elif choice == "4":
                    self._merge_upstream(repo_path)
                elif choice == "5":
                    self._push_existing_commits(repo_path)
                elif choice == "6":
                    self._show_diff_menu(repo_path)
                elif choice == "7":
                    self._commit_selected(repo_path, push=False)
                elif choice == "8":
                    self._commit_selected(repo_path, push=True)
                elif choice == "9":
                    self._commit_all(repo_path, push=False)
                elif choice == "10":
                    self._commit_all(repo_path, push=True)
                elif choice == "11":
                    self._discard_selected(repo_path)
                elif choice == "12":
                    self._delete_file(repo_path)
                elif choice == "13":
                    self.branch_manager(repo_path)
                elif choice == "14":
                    self.history_manager(repo_path)
                elif choice == "15":
                    self.stash_manager(repo_path)
                elif choice == "16":
                    self.remote_manager(repo_path)
                elif choice == "17":
                    self.repository_hygiene(repo_path)
                elif choice == "18":
                    if self._delete_local_repo(repo_path):
                        return
                elif choice == "19":
                    self._delete_remote_repo(repo_path)
                elif choice == "0":
                    return
                else:
                    self.ui.warning("Unknown option.")
                    continue
            except Exception as exc:
                self._print_exception(exc)

            self.ui.pause()

    def _show_actionable_state_summary(self, report: RepoReport) -> None:
        """
        Explain the repository state in practical Git terms.

        This prevents confusion between:
        - changed files that are not committed yet
        - commits that exist locally but are not pushed yet
        - commits that exist remotely but are not pulled yet
        """
        self.ui.section("What this means")

        if not report.is_git_repo:
            self.ui.info("This folder is not initialized with Git yet.")
            return

        if report.operation_in_progress:
            self.ui.warning(
                f"A Git {report.operation_in_progress} operation is in progress."
            )
            return

        if not report.remote_exists:
            self.ui.warning(
                "No remote is configured. Local Git works, but there is "
                "currently nowhere to fetch/pull/push."
            )
            return

        if not report.remote_ok:
            self.ui.warning(
                "The configured remote could not be reached."
            )
            if report.remote_error:
                self.ui.info(report.remote_error)
            return

        if report.changed_file_count:
            self.ui.info(
                f"{report.changed_file_count} file change(s) are local and "
                "UNCOMMITTED."
            )
        else:
            self.ui.info("No uncommitted local file changes.")

        if report.ahead:
            self.ui.info(
                f"{report.ahead} local commit(s) are ready to push."
            )
        else:
            self.ui.info("No committed changes are waiting to push.")

        if report.behind:
            self.ui.info(
                f"{report.behind} remote commit(s) need to be integrated locally."
            )
        else:
            self.ui.info("No newer remote commits are waiting.")

        if (
            report.changed_file_count == 0
            and report.ahead == 0
            and report.behind == 0
        ):
            self.ui.success("Repository is fully synchronized.")

    # ==================================================================
    # Fetch / pull / rebase / merge / push
    # ==================================================================

    def _fetch(self, repo_path: Path) -> None:
        remote = self.config.github.remote_name

        if not self.git.remote_exists(repo_path, remote):
            self.ui.warning(
                f"No '{remote}' remote is configured. Use Remote Manager."
            )
            return

        self.git.fetch(repo_path, remote)
        self.ui.success("Remote metadata refreshed.")

    def _require_clean_worktree(
        self,
        repo_path: Path,
        action_name: str,
    ) -> bool:
        changes = self.git.changes(repo_path)
        if not changes:
            return True

        self.ui.warning(
            f"{action_name} requires a clean working tree in GithubAuto."
        )
        self.ui.show_changes(changes)
        self.ui.info(
            "Commit selected files, commit all files, stash them, or cancel."
        )
        return False

    def _pull_ff(self, repo_path: Path) -> None:
        if not self._require_clean_worktree(
            repo_path,
            "Fast-forward pull",
        ):
            return

        self.git.pull_fast_forward(repo_path)
        self.ui.success("Fast-forward pull completed.")

    def _rebase_upstream(self, repo_path: Path) -> None:
        if not self._require_clean_worktree(repo_path, "Rebase"):
            return

        if not self.git.has_upstream(repo_path):
            self.ui.warning(
                "This branch has no upstream. Push it first with -u."
            )
            return

        try:
            self.git.rebase_upstream(repo_path)
        except GitCommandError as exc:
            conflicts = self.git.conflicted_files(repo_path)
            self.git.abort_rebase(repo_path)

            self.ui.error("Rebase failed and was automatically aborted.")
            if conflicts:
                self.ui.info(
                    "Conflicted files: " + ", ".join(conflicts)
                )
            if exc.output:
                self.ui.info(exc.output)
            return

        self.ui.success("Rebase completed.")
        self.ui.info(
            "Review the result, then push when you are ready."
        )

    def _merge_upstream(self, repo_path: Path) -> None:
        if not self._require_clean_worktree(repo_path, "Merge"):
            return

        if not self.git.has_upstream(repo_path):
            self.ui.warning(
                "This branch has no upstream. Push it first with -u."
            )
            return

        try:
            self.git.merge_upstream(repo_path)
        except GitCommandError as exc:
            conflicts = self.git.conflicted_files(repo_path)
            self.git.abort_merge(repo_path)

            self.ui.error("Merge failed and was automatically aborted.")
            if conflicts:
                self.ui.info(
                    "Conflicted files: " + ", ".join(conflicts)
                )
            if exc.output:
                self.ui.info(exc.output)
            return

        self.ui.success("Merge completed.")
        self.ui.info(
            "Review the result, then push when you are ready."
        )

    def _push_existing_commits(self, repo_path: Path) -> None:
        """
        Push commits that already exist locally.

        Important Git concept:
        - Uncommitted file changes are NOT pushed.
        - Git pushes commits, not loose working-tree files.

        This method explains mixed states clearly so the user knows whether
        they need option 8/10 (commit + push) or option 5 (push commits only).
        """
        if not self.git.has_commits(repo_path):
            changes = self.git.changes(repo_path)

            if changes:
                self.ui.warning(
                    "This repository has local files, but no Git commit exists yet."
                )
                self.ui.info(
                    f"{len(changes)} local file change(s) need to be committed first."
                )
                self.ui.info(
                    "Use:\n"
                    "  7. Commit selected file(s)\n"
                    "  8. Commit & push selected file(s)\n"
                    "  9. Commit all changed files\n"
                    " 10. Commit & push all changed files"
                )
            else:
                self.ui.warning("There are no commits to push.")

            return

        remote = self.config.github.remote_name

        if not self.git.remote_exists(repo_path, remote):
            self.ui.warning(
                f"No '{remote}' remote is configured. Use Remote Manager."
            )
            return

        # Refresh first so push decisions are based on current remote state.
        try:
            self.git.fetch(repo_path, remote)
        except GitCommandError as exc:
            self.ui.error("Remote refresh failed. Push was not attempted.")
            if exc.output:
                self.ui.info(exc.output)
            return

        local_changes = self.git.changes(repo_path)
        changed_count = len(local_changes)

        ahead = 0
        behind = 0

        if self.git.has_upstream(repo_path):
            ahead, behind = self.git.ahead_behind(repo_path)

            if behind > 0 and ahead > 0:
                self.ui.warning(
                    f"Local and remote histories have diverged: "
                    f"{ahead} local commit(s) ahead and "
                    f"{behind} remote commit(s) behind."
                )
                self.ui.info(
                    "Push is blocked until you integrate the remote history.\n"
                    "Use Repository Manager:\n"
                    "  3. Rebase current branch onto upstream\n"
                    "  4. Merge upstream into current branch"
                )

                if changed_count:
                    self.ui.info(
                        f"There are also {changed_count} uncommitted local "
                        "file change(s). Commit or stash them first."
                    )
                return

            if behind > 0:
                self.ui.warning(
                    f"Remote is ahead by {behind} commit(s). "
                    "Push was not attempted."
                )

                if changed_count:
                    self.ui.info(
                        f"You also have {changed_count} uncommitted local "
                        "file change(s)."
                    )

                self.ui.info("Integrate remote changes before pushing.")
                return

            if ahead == 0:
                if changed_count:
                    self.ui.success(
                        "No committed changes are waiting to be pushed."
                    )
                    self.ui.warning(
                        f"{changed_count} local file change(s) are still "
                        "uncommitted."
                    )
                    self.ui.info(
                        "To send them to GitHub:\n"
                        "  8. Commit & push selected file(s)\n"
                        " 10. Commit & push all changed files\n\n"
                        "To keep them local for now:\n"
                        "  7. Commit selected file(s)\n"
                        "  9. Commit all changed files"
                    )
                else:
                    self.ui.success(
                        "Local and remote branches are already synchronized. "
                        "Nothing needs to be pushed."
                    )
                return

            # ahead > 0 and behind == 0
            self.ui.info(
                f"{ahead} existing local commit(s) are ready to push."
            )

            if changed_count:
                self.ui.warning(
                    f"{changed_count} additional local file change(s) are "
                    "UNCOMMITTED and will NOT be included in this push."
                )
                self.ui.info(
                    "If you want those files included too, cancel and use:\n"
                    "  8. Commit & push selected file(s)\n"
                    " 10. Commit & push all changed files"
                )

                if not self.ui.confirm(
                    f"Push the existing {ahead} commit(s) only?"
                ):
                    return

        else:
            # No upstream yet. Pushing creates tracking with -u.
            if changed_count:
                self.ui.warning(
                    f"{changed_count} uncommitted local file change(s) will "
                    "NOT be included in this push."
                )

            self.ui.info(
                "This branch has no upstream yet. The push will create "
                "upstream tracking."
            )

            if changed_count and not self.ui.confirm(
                "Push existing commits without the uncommitted files?"
            ):
                return

        self.git.push_current_branch(repo_path, remote)
        self.ui.success("Push completed.")

        if changed_count:
            self.ui.warning(
                f"{changed_count} uncommitted local file change(s) remain "
                "on your computer."
            )


    # ==================================================================
    # Commit selected / all
    # ==================================================================

    def _commit_selected(
        self,
        repo_path: Path,
        push: bool,
    ) -> None:
        changes = self.git.changes(repo_path)
        if not changes:
            self.ui.success("No local changes to commit.")
            return

        paths = self.ui.choose_files(changes)
        if not paths:
            return

        self._commit_paths(repo_path, paths, push=push)

    def _commit_all(
        self,
        repo_path: Path,
        push: bool,
    ) -> None:
        paths = self.git.changed_paths(repo_path)
        if not paths:
            self.ui.success("No local changes to commit.")
            return

        self.ui.show_changes(self.git.changes(repo_path))
        if not self.ui.confirm(
            f"Commit all {len(paths)} changed path(s)?"
        ):
            return

        self._commit_paths(repo_path, paths, push=push)

    def _commit_paths(
        self,
        repo_path: Path,
        paths: list[str],
        push: bool,
    ) -> None:
        sensitive = self.git.sensitive_paths(repo_path, paths)

        if sensitive:
            self.ui.error(
                "Selected paths contain possible secrets/credentials."
            )
            for path in sensitive:
                self.ui.info(f"Blocked: {path}")
            self.ui.info(
                "Review those files manually. GithubAuto will not commit them."
            )
            return

        # If pushing selected files while old commits are already ahead, Git
        # would necessarily push those old commits too.
        if push and self.git.has_upstream(repo_path):
            try:
                self.git.fetch(
                    repo_path,
                    self.config.github.remote_name,
                )
                ahead, behind = self.git.ahead_behind(repo_path)
            except GitCommandError:
                ahead, behind = 0, 0

            if behind > 0:
                self.ui.warning(
                    "Remote has newer commits. Integrate remote changes "
                    "before commit-and-push."
                )
                return

            if ahead > 0:
                self.ui.warning(
                    f"This branch already has {ahead} unpushed commit(s). "
                    "Git cannot push only the new selected-file commit; "
                    "those older commits would also be pushed."
                )
                if not self.ui.confirm(
                    "Continue and push all branch commits?"
                ):
                    return

        summary = self.git.diff_summary_for_llm(
            repo_path,
            paths,
        )

        try:
            self.ui.info(
                "Generating commit subject with local Qwen/llama.cpp..."
            )
            message = self.llm.create_commit_message(
                repo_name=repo_path.name,
                change_summary=summary,
            )
            self.ui.success(f"Commit subject: {message}")
        except RuntimeError as exc:
            self.ui.warning(str(exc))
            message = self.llm.fallback_message(paths)
            self.ui.info(f"Fallback subject: {message}")

        # Stage only the selected paths. This is what makes selected-file
        # commits different from "commit all".
        self.git.stage_files(repo_path, paths)

        if not self.git.has_staged_changes(repo_path):
            self.ui.warning("Nothing was staged; no commit was created.")
            return

        self.git.commit_selected(repo_path, message, paths)
        self.ui.success(
            f"Committed {len(paths)} selected path(s)."
        )

        if push:
            self._push_existing_commits(repo_path)

    # ==================================================================
    # File operations
    # ==================================================================

    def _show_diff_menu(self, repo_path: Path) -> None:
        changes = self.git.changes(repo_path)
        if not changes:
            self.ui.success("No local changes.")
            return

        self.ui.show_changes(changes)
        print(
            "\n  1. Show diff for selected file(s)\n"
            "  2. Show unstaged diff for all tracked files\n"
            "  3. Show staged diff\n"
            "  0. Back"
        )
        choice = self.ui.read("\nChoose: ")

        if choice == "1":
            paths = self.ui.choose_files(changes)
            if not paths:
                return
            diff = self.git.diff(repo_path, paths=paths)
        elif choice == "2":
            diff = self.git.diff(repo_path)
        elif choice == "3":
            diff = self.git.diff(repo_path, staged=True)
        else:
            return

        if diff:
            print("\n" + diff)
        else:
            self.ui.info(
                "No textual diff is available "
                "(file may be new/binary/staged in another state)."
            )

    def _discard_selected(self, repo_path: Path) -> None:
        changes = self.git.changes(repo_path)
        if not changes:
            self.ui.success("No local changes.")
            return

        paths = self.ui.choose_files(changes)
        if not paths:
            return

        untracked = {
            change.path
            for change in changes
            if change.is_untracked
        }
        untracked_selected = [
            path for path in paths if path in untracked
        ]

        if untracked_selected:
            self.ui.warning(
                "Restore does not silently delete untracked files. "
                "Use 'Delete one local file' for those paths."
            )

        tracked_selected = [
            path for path in paths if path not in untracked
        ]
        if not tracked_selected:
            return

        if not self.ui.typed_confirmation(
            "This discards uncommitted tracked-file edits.",
            "DISCARD",
        ):
            return

        restored, skipped = self.git.restore_files(
            repo_path,
            tracked_selected,
        )

        if restored:
            self.ui.success(
                f"Discarded changes in {len(restored)} tracked file(s)."
            )

        if skipped:
            self.ui.warning(
                "These new files were not deleted automatically: "
                + ", ".join(skipped)
            )

    def _delete_file(self, repo_path: Path) -> None:
        relative_path = self.ui.read(
            "Repository-relative file path to delete: "
        )
        if not relative_path:
            return

        if not self.ui.typed_confirmation(
            f"Delete local file '{relative_path}'?",
            "DELETE",
        ):
            return

        self.git.delete_local_file(repo_path, relative_path)
        self.ui.success("Local file deleted.")
        self.ui.info(
            "If it was tracked, commit its deletion before pushing."
        )

    # ==================================================================
    # Branch manager
    # ==================================================================

    def branch_manager(self, repo_path: Path) -> None:
        while True:
            self.ui.title(f"Branch Manager — {repo_path.name}")
            current = self.git.current_branch(repo_path)
            local = self.git.local_branches(repo_path)
            remote = (
                self.git.remote_branches(
                    repo_path,
                    self.config.github.remote_name,
                )
                if self.git.remote_exists(
                    repo_path,
                    self.config.github.remote_name,
                )
                else []
            )

            print(f"  Current branch: {current or '(detached)'}")
            print(
                "  Local branches : "
                + (", ".join(local) if local else "(none)")
            )
            print(
                "  Remote branches: "
                + (", ".join(remote) if remote else "(none)")
            )

            print(
                "\n  1. Create & switch to new branch\n"
                "     Starts a new branch from the current commit.\n\n"
                "  2. Create branch without switching\n"
                "  3. Switch branch\n"
                "  4. Push current branch / set upstream\n"
                "  5. Create new branch and push immediately\n"
                "  6. Merge another local branch into current\n"
                "  7. Rebase current branch onto another local branch\n"
                "  8. Delete local branch (safe -d)\n"
                "  9. Force-delete local branch (-D)\n"
                " 10. Delete remote branch\n"
                "  0. Back"
            )

            choice = self.ui.read("\nChoose: ")

            try:
                if choice == "1":
                    name = self.ui.read("New branch name: ")
                    self.git.create_branch(
                        repo_path,
                        name,
                        switch=True,
                    )
                    self.ui.success(f"Created and switched to '{name}'.")
                elif choice == "2":
                    name = self.ui.read("New branch name: ")
                    self.git.create_branch(
                        repo_path,
                        name,
                        switch=False,
                    )
                    self.ui.success(f"Created '{name}'.")
                elif choice == "3":
                    name = self.ui.read("Branch to switch to: ")
                    self.git.switch_branch(repo_path, name)
                    self.ui.success(f"Switched to '{name}'.")
                elif choice == "4":
                    self._push_existing_commits(repo_path)
                elif choice == "5":
                    name = self.ui.read("New branch name: ")
                    self.git.create_branch(
                        repo_path,
                        name,
                        switch=True,
                    )
                    self._push_existing_commits(repo_path)
                elif choice == "6":
                    if not self._require_clean_worktree(
                        repo_path,
                        "Branch merge",
                    ):
                        continue
                    name = self.ui.read("Branch to merge: ")
                    try:
                        self.git.merge_branch(repo_path, name)
                    except GitCommandError:
                        self.git.abort_merge(repo_path)
                        raise
                    self.ui.success("Branch merge completed.")
                elif choice == "7":
                    if not self._require_clean_worktree(
                        repo_path,
                        "Branch rebase",
                    ):
                        continue
                    name = self.ui.read("Rebase current branch onto: ")
                    try:
                        self.git.rebase_onto_branch(repo_path, name)
                    except GitCommandError:
                        self.git.abort_rebase(repo_path)
                        raise
                    self.ui.success("Branch rebase completed.")
                elif choice == "8":
                    name = self.ui.read("Local branch to delete: ")
                    self.git.delete_local_branch(
                        repo_path,
                        name,
                        force=False,
                    )
                    self.ui.success(f"Deleted local branch '{name}'.")
                elif choice == "9":
                    name = self.ui.read(
                        "Local branch to FORCE delete: "
                    )
                    if self.ui.typed_confirmation(
                        "Unmerged work may be lost.",
                        name,
                    ):
                        self.git.delete_local_branch(
                            repo_path,
                            name,
                            force=True,
                        )
                        self.ui.success(
                            f"Force-deleted local branch '{name}'."
                        )
                elif choice == "10":
                    name = self.ui.read("Remote branch to delete: ")
                    if self.ui.typed_confirmation(
                        "This deletes the remote branch.",
                        name,
                    ):
                        self.git.delete_remote_branch(
                            repo_path,
                            self.config.github.remote_name,
                            name,
                        )
                        self.ui.success(
                            f"Deleted remote branch '{name}'."
                        )
                elif choice == "0":
                    return
                else:
                    self.ui.warning("Unknown option.")
                    continue
            except Exception as exc:
                self._print_exception(exc)

            self.ui.pause()

    # ==================================================================
    # History manager
    # ==================================================================

    def history_manager(self, repo_path: Path) -> None:
        while True:
            self.ui.title(f"History & Recovery — {repo_path.name}")

            commits = self.git.recent_commits(
                repo_path,
                self.config.git.history_limit,
            )
            if commits:
                for line in commits:
                    print("  " + line)
            else:
                self.ui.info("No commits found.")

            print(
                "\n  1. Revert a commit\n"
                "     Safe shared-history undo: creates a NEW commit that "
                "reverses the selected commit.\n\n"
                "  2. Soft reset to commit\n"
                "     Moves HEAD but keeps later changes staged.\n\n"
                "  3. Mixed reset to commit\n"
                "     Moves HEAD but keeps later changes as unstaged files.\n\n"
                "  4. Hard reset to commit\n"
                "     Permanently discards later commits/files. Disabled by "
                "default in config.yaml.\n\n"
                "  0. Back"
            )

            choice = self.ui.read("\nChoose: ")

            try:
                if choice == "1":
                    if not self._require_clean_worktree(
                        repo_path,
                        "Revert",
                    ):
                        continue
                    ref = self.ui.read("Commit SHA/ref to revert: ")
                    self.git.revert_commit(repo_path, ref)
                    self.ui.success(
                        "Revert commit created. Push it when ready."
                    )
                elif choice == "2":
                    ref = self.ui.read("Reset HEAD softly to: ")
                    if self.ui.confirm(
                        "Move HEAD while keeping changes staged?"
                    ):
                        self.git.reset_soft(repo_path, ref)
                        self.ui.success("Soft reset completed.")
                elif choice == "3":
                    ref = self.ui.read("Reset HEAD mixed to: ")
                    if self.ui.confirm(
                        "Move HEAD while keeping changes unstaged?"
                    ):
                        self.git.reset_mixed(repo_path, ref)
                        self.ui.success("Mixed reset completed.")
                elif choice == "4":
                    if not self.config.safety.allow_hard_reset:
                        self.ui.warning(
                            "Hard reset is disabled. Set "
                            "safety.allow_hard_reset: true in config.yaml "
                            "only when you intentionally need it."
                        )
                        self.ui.pause()
                        continue

                    ref = self.ui.read("HARD reset target: ")
                    if self.ui.typed_confirmation(
                        "This can permanently destroy local work.",
                        "HARD RESET",
                    ):
                        self.git.reset_hard(repo_path, ref)
                        self.ui.success("Hard reset completed.")
                elif choice == "0":
                    return
                else:
                    self.ui.warning("Unknown option.")
                    continue
            except Exception as exc:
                self._print_exception(exc)

            self.ui.pause()

    # ==================================================================
    # Stash
    # ==================================================================

    def stash_manager(self, repo_path: Path) -> None:
        while True:
            self.ui.title(f"Stash Manager — {repo_path.name}")
            stashes = self.git.stash_list(repo_path)

            if stashes:
                for line in stashes:
                    print("  " + line)
            else:
                self.ui.info("No stashes.")

            print(
                "\n  1. Stash current changes (includes untracked files)\n"
                "     Temporarily stores changes and returns the working tree "
                "to a clean state.\n\n"
                "  2. Apply stash (keep stash entry)\n"
                "  3. Pop stash (apply and remove entry)\n"
                "  4. Drop stash entry\n"
                "  0. Back"
            )

            choice = self.ui.read("\nChoose: ")

            try:
                if choice == "1":
                    message = self.ui.read(
                        "Optional stash description: "
                    )
                    self.git.stash_save(
                        repo_path,
                        message,
                        include_untracked=True,
                    )
                    self.ui.success("Changes stashed.")
                elif choice == "2":
                    ref = self.ui.read(
                        "Stash ref (e.g. stash@{0}): "
                    )
                    self.git.stash_apply(repo_path, ref)
                    self.ui.success("Stash applied.")
                elif choice == "3":
                    ref = self.ui.read(
                        "Stash ref (e.g. stash@{0}): "
                    )
                    self.git.stash_pop(repo_path, ref)
                    self.ui.success("Stash popped.")
                elif choice == "4":
                    ref = self.ui.read(
                        "Stash ref (e.g. stash@{0}): "
                    )
                    if self.ui.typed_confirmation(
                        "This permanently removes the stash entry.",
                        "DROP",
                    ):
                        self.git.stash_drop(repo_path, ref)
                        self.ui.success("Stash dropped.")
                elif choice == "0":
                    return
                else:
                    self.ui.warning("Unknown option.")
                    continue
            except Exception as exc:
                self._print_exception(exc)

            self.ui.pause()

    # ==================================================================
    # Remote manager
    # ==================================================================

    def remote_manager(self, repo_path: Path) -> None:
        while True:
            remote = self.config.github.remote_name
            exists = self.git.remote_exists(repo_path, remote)
            url = (
                self.git.get_remote_url(repo_path, remote)
                if exists
                else ""
            )

            self.ui.title(f"Remote Manager — {repo_path.name}")
            print(f"  Remote name: {remote}")
            print(f"  Current URL: {url or '(not configured)'}")

            print(
                "\n  1. Test / fetch current remote\n"
                "  2. Create/find matching GitHub repository and connect it\n"
                "     Requires GITHUB_TOKEN because Git cannot create a "
                "GitHub repository by itself.\n\n"
                "  3. Replace remote URL manually\n"
                "  4. Remove remote\n"
                "  0. Back"
            )

            choice = self.ui.read("\nChoose: ")

            try:
                if choice == "1":
                    if not exists:
                        self.ui.warning("No remote is configured.")
                    else:
                        self.git.fetch(repo_path, remote)
                        self.ui.success("Remote is reachable.")
                elif choice == "2":
                    self._create_or_connect_remote(repo_path)
                elif choice == "3":
                    new_url = self.ui.read("New Git remote URL: ")
                    if not new_url:
                        continue

                    if exists:
                        self.git.set_remote_url(
                            repo_path,
                            remote,
                            new_url,
                        )
                    else:
                        self.git.add_remote(
                            repo_path,
                            remote,
                            new_url,
                        )
                    self.ui.success("Remote URL updated.")
                elif choice == "4":
                    if not exists:
                        self.ui.warning("No remote is configured.")
                    elif self.ui.typed_confirmation(
                        f"Remove local remote '{remote}'?",
                        "REMOVE",
                    ):
                        self.git.remove_remote(repo_path, remote)
                        self.ui.success("Remote removed locally.")
                elif choice == "0":
                    return
                else:
                    self.ui.warning("Unknown option.")
                    continue
            except Exception as exc:
                self._print_exception(exc)

            self.ui.pause()

    def _create_or_connect_remote(self, repo_path: Path) -> None:
        if not self.github.is_configured():
            self.ui.error(
                "GITHUB_TOKEN is empty. Normal Git push may use your Mac "
                "credentials, but creating a GitHub repository needs API "
                "authentication."
            )
            return

        remote_repo, created = self.github.create_or_get_repository(
            name=repo_path.name,
            visibility=self.config.github.default_visibility,
        )

        remote = self.config.github.remote_name
        if self.git.remote_exists(repo_path, remote):
            self.git.set_remote_url(
                repo_path,
                remote,
                remote_repo.clone_url,
            )
        else:
            self.git.add_remote(
                repo_path,
                remote,
                remote_repo.clone_url,
            )

        if created:
            self.ui.success(
                f"Created GitHub repository: {remote_repo.html_url}"
            )
        else:
            self.ui.success(
                f"Found existing GitHub repository: "
                f"{remote_repo.html_url}"
            )

        self.ui.success(
            f"Connected local '{remote}' to {remote_repo.clone_url}"
        )

    # ==================================================================
    # Repository creation/import
    # ==================================================================

    def create_import_menu(self) -> None:
        while True:
            self.ui.title("Create / Import Repository")
            print(
                "  1. Initialize an existing plain folder inside repo/\n"
                "     Adds Git locally. You can then create/connect GitHub "
                "and push when ready.\n\n"
                "  2. Create a brand-new local project folder\n"
                "     Creates repo/<name>/ and initializes Git on main.\n\n"
                "  3. Clone an existing GitHub/Git repository into repo/\n"
                "  0. Back"
            )

            choice = self.ui.read("\nChoose: ")

            try:
                if choice == "1":
                    plain = [
                        path
                        for path in self.scanner.discover_projects()
                        if not self.git.is_git_repo(path)
                    ]
                    if not plain:
                        self.ui.success(
                            "No plain folders were found inside repo/."
                        )
                        self.ui.pause()
                        continue

                    for i, path in enumerate(plain, start=1):
                        print(f"  {i}. {path.name}")

                    index = self.ui.select_number(
                        len(plain),
                        "Choose folder (0 = back): ",
                    )
                    if index is None:
                        continue
                    self._initialize_existing_folder(plain[index])
                elif choice == "2":
                    name = self.ui.read("New project folder name: ")
                    if not name or "/" in name or "\\" in name:
                        self.ui.warning("Use a simple folder name.")
                        continue

                    destination = self.config.repo_dir / name
                    if destination.exists():
                        self.ui.warning("That folder already exists.")
                        continue

                    destination.mkdir()
                    self._initialize_existing_folder(destination)
                elif choice == "3":
                    url = self.ui.read("Git clone URL: ")
                    if not url:
                        continue

                    name = self.git.folder_name_from_url(url)
                    destination = self.config.repo_dir / name
                    if destination.exists():
                        self.ui.warning(
                            f"{destination} already exists."
                        )
                        continue

                    self.git.clone(url, destination)
                    self.ui.success(f"Cloned into {destination}")
                elif choice == "0":
                    return
                else:
                    self.ui.warning("Unknown option.")
                    continue
            except Exception as exc:
                self._print_exception(exc)

            self.ui.pause()

    def _initialize_existing_folder(self, path: Path) -> None:
        if self.git.is_git_repo(path):
            self.ui.info("Folder is already a Git repository.")
            return

        self.git.init_repository(path, branch="main")
        self._write_initial_gitignore_if_missing(path)
        self.ui.success("Initialized Git repository on branch 'main'.")

        if self.ui.confirm(
            "Create/find the matching GitHub remote now?"
        ):
            self._create_or_connect_remote(path)

    @staticmethod
    def _write_initial_gitignore_if_missing(repo_path: Path) -> None:
        """
        Only NEW repositories receive starter ignores automatically.

        Existing repositories are never modified merely because they were
        scanned.
        """
        gitignore = repo_path / ".gitignore"
        if gitignore.exists():
            return

        gitignore.write_text(
            "# Local secrets\n"
            ".env\n"
            ".env.*\n"
            "!.env.example\n\n"
            "# OS files\n"
            ".DS_Store\n"
            "Thumbs.db\n\n"
            "# Python\n"
            "__pycache__/\n"
            "*.pyc\n",
            encoding="utf-8",
        )

    # ==================================================================
    # Hygiene
    # ==================================================================

    def repository_hygiene(self, repo_path: Path) -> None:
        self.ui.title(f"Repository Hygiene — {repo_path.name}")

        suggested = [
            ".env",
            ".env.*",
            "!.env.example",
            ".DS_Store",
            "Thumbs.db",
            "__pycache__/",
            "*.pyc",
        ]

        print(
            "  This action is OPTIONAL. Scanning never changes .gitignore.\n"
            "  Suggested local-only patterns:"
        )
        for line in suggested:
            print(f"    {line}")

        if not self.ui.confirm(
            "Append missing patterns to this repository's .gitignore?"
        ):
            return

        gitignore = repo_path / ".gitignore"
        existing = (
            gitignore.read_text(
                encoding="utf-8",
                errors="replace",
            )
            if gitignore.exists()
            else ""
        )
        existing_lines = {
            line.strip()
            for line in existing.splitlines()
        }
        missing = [
            line for line in suggested
            if line not in existing_lines
        ]

        if not missing:
            self.ui.success("All suggested patterns already exist.")
            return

        with gitignore.open("a", encoding="utf-8") as file:
            if existing and not existing.endswith("\n"):
                file.write("\n")
            if existing.strip():
                file.write("\n")
            file.write("# Local-only files\n")
            for line in missing:
                file.write(line + "\n")

        self.ui.success(
            f"Added {len(missing)} pattern(s) to .gitignore."
        )
        self.ui.info(
            "Review and commit .gitignore only if you want these rules "
            "shared with the repository."
        )

    # ==================================================================
    # Delete local / remote repository
    # ==================================================================

    def _delete_local_repo(self, repo_path: Path) -> bool:
        expected = repo_path.name

        if not self.ui.typed_confirmation(
            f"Delete LOCAL folder '{repo_path}' permanently?",
            expected,
        ):
            return False

        self.git.delete_local_repository(repo_path)
        self.ui.success("Local repository folder deleted.")
        return True

    def _delete_remote_repo(self, repo_path: Path) -> None:
        if not self.config.safety.allow_remote_repo_delete:
            self.ui.warning(
                "Remote repository deletion is disabled by default.\n"
                "Set safety.allow_remote_repo_delete: true in config.yaml "
                "only when you intentionally want this capability."
            )
            return

        remote = self.config.github.remote_name
        if not self.git.remote_exists(repo_path, remote):
            self.ui.warning("No configured GitHub remote.")
            return

        url = self.git.get_remote_url(repo_path, remote)
        parsed = self.git.parse_github_remote(url)

        if not parsed:
            self.ui.warning(
                "Current remote is not a recognized github.com URL."
            )
            return

        owner, name = parsed

        if not self.ui.typed_confirmation(
            f"PERMANENTLY delete GitHub repository {owner}/{name}?",
            f"{owner}/{name}",
        ):
            return

        if not self.ui.typed_confirmation(
            "Final confirmation.",
            "DELETE REMOTE",
        ):
            return

        self.github.delete_repository(owner, name)
        self.ui.success(
            f"Remote GitHub repository {owner}/{name} deleted."
        )

    # ==================================================================
    # Model/config check
    # ==================================================================

    def model_config_check(self) -> None:
        self.ui.title("Model & Configuration Check")
        print(f"  Project root     : {self.config.project_root}")
        print(f"  Repository folder: {self.config.repo_dir}")
        print(f"  llama executable : {self.config.llm.executable}")
        print(f"  Local model      : {self.llm.status()}")
        print(
            "  GitHub API token : "
            + ("configured" if self.github.is_configured() else "not configured")
        )
        print(
            "  New repo privacy : "
            + self.config.github.default_visibility
        )
        print(
            "  Divergence style : "
            + self.config.git.preferred_divergence_strategy
        )
        print(
            "  Remote delete    : "
            + (
                "enabled"
                if self.config.safety.allow_remote_repo_delete
                else "disabled"
            )
        )

        # Check llama-cli availability without loading the model.
        try:
            result = subprocess.run(
                [self.config.llm.executable, "--version"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
            version_text = (
                result.stdout.strip()
                or result.stderr.strip()
            )
            if version_text:
                self.ui.section("llama.cpp")
                print(version_text)
        except FileNotFoundError:
            self.ui.warning(
                f"llama.cpp executable not found: "
                f"{self.config.llm.executable}"
            )

        self.ui.pause()

    # ==================================================================
    # Error display
    # ==================================================================

    def _print_exception(self, exc: Exception) -> None:
        self.ui.error(str(exc))

        if isinstance(exc, GitCommandError) and exc.output:
            self.ui.info(exc.output)

        if isinstance(exc, GitHubAPIError):
            self.ui.info(
                "GitHub API actions may require a token with the relevant "
                "repository permissions."
            )