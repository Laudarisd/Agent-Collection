from __future__ import annotations

import re
import subprocess

from github_auto.config import LLMSettings


class LocalLLM:
    """
    Use the local llama.cpp model only for commit-message language generation.

    The model never decides which Git command to execute.
    """

    INVALID_OUTPUTS = {
        "exiting",
        "exiting...",
        "loading model",
        "loading model...",
        "available commands:",
    }

    def __init__(self, settings: LLMSettings) -> None:
        self.settings = settings

    def is_configured(self) -> bool:
        return self.settings.model_path.is_file()

    def status(self) -> str:
        if self.is_configured():
            return f"ready: {self.settings.model_path}"
        return f"not found: {self.settings.model_path}"

    def create_commit_message(
        self,
        repo_name: str,
        change_summary: str,
    ) -> str:
        """
        Generate one commit subject.

        `-no-cnv` is important for instruct GGUF models whose embedded chat
        template would otherwise make llama-cli automatically enter conversation
        mode and print interactive UI such as "Exiting...".
        """
        if not self.is_configured():
            raise RuntimeError(
                f"Local model was not found: {self.settings.model_path}"
            )

        prompt = (
            "Write exactly one concise Git commit subject for these changes.\n"
            "Return only the subject line.\n"
            "Maximum 72 characters.\n"
            "Use imperative wording.\n"
            "Do not write markdown, quotes, explanations, or labels.\n\n"
            f"Repository: {repo_name}\n"
            f"Changes:\n{change_summary}\n\n"
            "Commit subject:"
        )

        command = [
            self.settings.executable,
            "-m",
            str(self.settings.model_path),
            "-no-cnv",
            "--simple-io",
            "--log-disable",
            "--no-display-prompt",
            "--no-show-timings",
            "--no-warmup",
            "-n",
            str(self.settings.max_tokens),
            "--temp",
            str(self.settings.temperature),
            "-p",
            prompt,
        ]

        try:
            result = subprocess.run(
                command,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=self.settings.timeout_seconds,
                check=False,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                f"llama.cpp executable not found: "
                f"{self.settings.executable}"
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(
                "Local model timed out while generating a commit message."
            ) from exc

        if result.returncode != 0:
            error = self._compact(result.stderr) or "Unknown llama.cpp error."
            raise RuntimeError(f"llama.cpp failed: {error[:500]}")

        message = self._extract_subject(
            stdout=result.stdout,
            stderr=result.stderr,
        )

        if not message:
            raise RuntimeError(
                "No valid commit subject could be captured from llama.cpp."
            )

        return message

    def _extract_subject(
        self,
        stdout: str,
        stderr: str,
    ) -> str:
        """
        Parse only plausible generated lines.

        stdout is preferred. stderr is considered only as a compatibility
        fallback because some builds route generated output differently.
        """
        candidates: list[str] = []

        for text in (stdout, stderr):
            for raw_line in text.splitlines():
                line = self._clean_line(raw_line)
                if not line:
                    continue

                lowered = line.lower()
                if lowered in self.INVALID_OUTPUTS:
                    continue

                if lowered.startswith(
                    (
                        "llama_",
                        "ggml_",
                        "main:",
                        "system_info:",
                        "build:",
                        "version:",
                        "available commands",
                        "/exit",
                        "/regen",
                        "/clear",
                        "/read",
                        "/glob",
                        "loading model",
                    )
                ):
                    continue

                # Reject terminal prompt echoes and our own prompt text.
                if line.startswith(">"):
                    continue
                if "commit subject:" == lowered:
                    continue
                if lowered.startswith("repository:"):
                    continue
                if lowered.startswith("changes:"):
                    continue

                candidates.append(line)

            if candidates:
                break

        if not candidates:
            return ""

        # With -no-cnv, the generated subject should be the first useful line.
        subject = candidates[0]
        subject = re.sub(
            r"^(commit message|commit subject|subject)\s*:\s*",
            "",
            subject,
            flags=re.IGNORECASE,
        )
        subject = re.sub(r"^[-*•]\s+", "", subject).strip()
        subject = " ".join(subject.strip("`'\" ").split())

        if subject.lower() in self.INVALID_OUTPUTS:
            return ""

        if len(subject) < 3:
            return ""

        return subject[:72].rstrip()

    @staticmethod
    def fallback_message(paths: list[str]) -> str:
        """
        Deterministic fallback if the model is unavailable.

        A language-model failure must never force the user to stop normal Git
        work.
        """
        clean_names = [
            path
            for path in paths
            if not path.endswith(".DS_Store")
        ]

        if len(clean_names) == 1:
            return f"Update {clean_names[0]}"[:72]

        if 1 < len(clean_names) <= 3:
            return (
                "Update " + ", ".join(clean_names)
            )[:72]

        return "Update repository files"

    @staticmethod
    def _clean_line(line: str) -> str:
        return line.strip()

    @staticmethod
    def _compact(text: str) -> str:
        return " ".join(text.split())
