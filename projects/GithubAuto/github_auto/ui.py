from __future__ import annotations

from pathlib import Path
from typing import Iterable

from github_auto.models import FileChange, RepoReport


class TerminalUI:
    """Simple numbered terminal UI with no extra UI dependency."""

    WIDTH = 94

    @classmethod
    def title(cls, text: str) -> None:
        print("\n" + "═" * cls.WIDTH)
        print(f"  {text}")
        print("═" * cls.WIDTH)

    @staticmethod
    def section(text: str) -> None:
        print(f"\n── {text} " + "─" * max(1, 70 - len(text)))

    @staticmethod
    def info(text: str) -> None:
        print(f"  {text}")

    @staticmethod
    def success(text: str) -> None:
        print(f"  ✓ {text}")

    @staticmethod
    def warning(text: str) -> None:
        print(f"  ! {text}")

    @staticmethod
    def error(text: str) -> None:
        print(f"  ✗ {text}")

    @staticmethod
    def pause() -> None:
        input("\nPress Enter to continue...")

    @staticmethod
    def read(prompt: str) -> str:
        return input(prompt).strip()

    @staticmethod
    def confirm(prompt: str, default: bool = False) -> bool:
        suffix = " [Y/n]: " if default else " [y/N]: "
        answer = input(prompt + suffix).strip().lower()

        if not answer:
            return default

        return answer in {"y", "yes"}

    @staticmethod
    def typed_confirmation(
        prompt: str,
        expected: str,
    ) -> bool:
        value = input(
            f"{prompt}\nType '{expected}' to confirm: "
        ).strip()
        return value == expected

    @classmethod
    def main_menu(cls) -> None:
        cls.title("GitHubAuto — Interactive Git Manager")
        print(
            "  1. Scan & compare all repositories\n"
            "     Safe overview. Fetches remote metadata and shows exactly "
            "what differs. No commit/pull/push.\n\n"
            "  2. Smart Sync Assistant\n"
            "     Shows only repositories needing attention and recommends "
            "the next action. You choose what runs.\n\n"
            "  3. Repository Manager\n"
            "     Select one repository for fetch, pull, rebase, merge, "
            "selected-file commits, push, branches, history, delete, etc.\n\n"
            "  4. Create / Import Repository\n"
            "     Initialize a local folder, create/connect a GitHub remote, "
            "or clone an existing repository.\n\n"
            "  5. Model & configuration check\n"
            "     Verify the local Qwen/llama.cpp setup and important paths.\n\n"
            "  0. Exit"
        )

    @classmethod
    def reports_table(
        cls,
        reports: list[RepoReport],
        preferred_strategy: str,
        only_attention: bool = False,
    ) -> list[RepoReport]:
        visible = [
            report
            for report in reports
            if not only_attention or report.needs_attention
        ]

        if not visible:
            cls.success("Everything is synchronized. No action is required.")
            return []

        cls.section("Repository status")
        print(
            f"{'#':>3}  {'Repository':<31} "
            f"{'Branch':<14} {'Files':>5} {'↑':>3} {'↓':>3}  Status"
        )
        print("  " + "-" * 90)

        for index, report in enumerate(visible, start=1):
            if not report.is_git_repo:
                status = "NOT A GIT REPO"
            elif report.operation_in_progress:
                status = f"{report.operation_in_progress.upper()} IN PROGRESS"
            elif report.scan_error:
                status = "ERROR"
            elif not report.remote_exists:
                status = "NO REMOTE"
            elif not report.remote_ok:
                status = "REMOTE ERROR"
            elif report.is_diverged:
                status = "DIVERGED"
            elif report.behind > 0:
                status = "REMOTE AHEAD"
            elif report.ahead > 0:
                status = "LOCAL AHEAD"
            elif report.has_local_changes:
                status = "LOCAL CHANGES"
            else:
                status = "SYNCED"

            print(
                f"{index:>3}  "
                f"{cls._clip(report.name, 31):<31} "
                f"{cls._clip(report.branch or '-', 14):<14} "
                f"{report.changed_file_count:>5} "
                f"{report.ahead:>3} "
                f"{report.behind:>3}  "
                f"{status}"
            )

        cls.section("Recommended next action")
        for index, report in enumerate(visible, start=1):
            print(
                f"  {index:>2}. {report.name}: "
                f"{report.recommendation(preferred_strategy)}"
            )

        return visible

    @staticmethod
    def select_number(
        count: int,
        prompt: str,
        allow_zero: bool = True,
    ) -> int | None:
        while True:
            raw = input(prompt).strip()

            if allow_zero and raw == "0":
                return None

            try:
                value = int(raw)
            except ValueError:
                print("Please enter a number.")
                continue

            if 1 <= value <= count:
                return value - 1

            print(f"Choose a number between 1 and {count}.")

    @classmethod
    def choose_report(
        cls,
        reports: list[RepoReport],
        prompt: str = "Choose repository number (0 = back): ",
    ) -> RepoReport | None:
        if not reports:
            return None

        index = cls.select_number(
            len(reports),
            prompt,
            allow_zero=True,
        )
        if index is None:
            return None
        return reports[index]

    @classmethod
    def show_repo_details(
        cls,
        report: RepoReport,
        preferred_strategy: str,
    ) -> None:
        cls.title(f"Repository: {report.name}")
        print(f"  Local path       : {report.path}")
        print(f"  Git repository   : {'yes' if report.is_git_repo else 'no'}")

        if not report.is_git_repo:
            print(
                "  Recommendation   : "
                + report.recommendation(preferred_strategy)
            )
            return

        print(f"  Branch           : {report.branch or '(detached/unborn)'}")
        print(f"  Local commits    : {'yes' if report.has_commits else 'no'}")
        print(f"  Changed files    : {report.changed_file_count}")
        print(
            f"  Remote           : "
            f"{report.remote_url or '(not configured)'}"
        )
        print(
            f"  Remote reachable : "
            f"{'yes' if report.remote_ok else 'no'}"
        )
        print(
            f"  Upstream         : "
            f"{'yes' if report.has_upstream else 'no'}"
        )
        print(f"  Ahead / Behind   : {report.ahead} / {report.behind}")

        if report.operation_in_progress:
            print(
                f"  In progress      : {report.operation_in_progress}"
            )

        if report.remote_error:
            print(f"  Remote error     : {report.remote_error}")

        if report.scan_error:
            print(f"  Scan error       : {report.scan_error}")

        print(
            "  Recommendation   : "
            + report.recommendation(preferred_strategy)
        )

    @classmethod
    def show_changes(cls, changes: list[FileChange]) -> None:
        cls.section("Changed files")

        if not changes:
            cls.success("No local file changes.")
            return

        for index, change in enumerate(changes, start=1):
            print(
                f"  {index:>2}. "
                f"[{change.short_status:<18}] "
                f"{change.path}"
            )

    @classmethod
    def choose_files(
        cls,
        changes: list[FileChange],
    ) -> list[str]:
        """
        Accept:
          1
          1,3,5
          2-5
          a
          0
        """
        if not changes:
            cls.info("There are no changed files to choose.")
            return []

        cls.show_changes(changes)

        while True:
            raw = input(
                "\nChoose file number(s), e.g. 1,3 or 2-5 "
                "(a = all, 0 = cancel): "
            ).strip().lower()

            if raw == "0":
                return []

            if raw == "a":
                return [change.path for change in changes]

            selected: set[int] = set()
            valid = True

            for part in raw.split(","):
                part = part.strip()
                if not part:
                    continue

                if "-" in part:
                    try:
                        start_raw, end_raw = part.split("-", 1)
                        start = int(start_raw)
                        end = int(end_raw)
                    except ValueError:
                        valid = False
                        break

                    if start > end:
                        start, end = end, start

                    selected.update(range(start, end + 1))
                else:
                    try:
                        selected.add(int(part))
                    except ValueError:
                        valid = False
                        break

            if (
                not valid
                or not selected
                or min(selected) < 1
                or max(selected) > len(changes)
            ):
                print("Invalid selection. Try again.")
                continue

            return [
                changes[index - 1].path
                for index in sorted(selected)
            ]

    @staticmethod
    def _clip(text: str, width: int) -> str:
        if len(text) <= width:
            return text
        return text[: max(1, width - 1)] + "…"
