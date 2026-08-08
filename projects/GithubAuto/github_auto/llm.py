from __future__ import annotations

import re
import subprocess

from github_auto.config import LLMSettings


class LocalLLM:
    """
    Small wrapper around llama.cpp.

    The model is used only for language tasks such as writing a commit subject.
    Git itself remains responsible for repository state and Git operations.
    """

    def __init__(self, settings: LLMSettings) -> None:
        self.settings = settings

    def is_configured(self) -> bool:
        """Return True when the configured GGUF model exists."""
        return self.settings.model_path.is_file()

    def model_status(self) -> str:
        """Return a simple model-status string for startup diagnostics."""
        if self.is_configured():
            return f"ready: {self.settings.model_path}"
        return f"not found: {self.settings.model_path}"

    def create_commit_message(self, repo_name: str, diff_summary: str) -> str:
        """
        Generate one concise Git commit subject.

        --simple-io is important when llama-cli is launched from Python.
        --log-disable keeps runtime logs out of captured generation text.
        """
        if not self.is_configured():
            raise RuntimeError(
                f"Local model was not found: {self.settings.model_path}"
            )

        prompt = (
            "Write exactly one Git commit subject.\n"
            "Return only the subject line.\n"
            "Maximum 72 characters.\n"
            "Use imperative wording.\n"
            "No quotes, markdown, bullets, explanations, or prefixes.\n"
            "Describe only the supplied changes.\n\n"
            f"Repository: {repo_name}\n"
            f"Changes:\n{diff_summary}\n"
        )

        command = [
            self.settings.executable,
            "-m",
            str(self.settings.model_path),
            "--simple-io",
            "--log-disable",
            "--no-display-prompt",
            "--no-show-timings",
            "--single-turn",
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
                f"llama.cpp executable was not found: {self.settings.executable}"
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(
                "The local model timed out while generating a commit message."
            ) from exc

        if result.returncode != 0:
            error = self._short_error(result.stderr) or "Unknown llama.cpp error."
            raise RuntimeError(f"llama.cpp failed: {error}")

        generated_text = self._extract_generated_text(
            stdout=result.stdout,
            stderr=result.stderr,
        )
        message = self._clean_commit_message(generated_text)

        if not message:
            raise RuntimeError(
                "The local model completed but no commit subject could be captured."
            )

        return message

    @staticmethod
    def _extract_generated_text(stdout: str, stderr: str) -> str:
        """
        Extract model text from llama.cpp output.

        Newer llama.cpp builds can behave differently depending on terminal /
        subprocess IO. stdout is preferred; stderr is a defensive fallback.
        """
        stdout = stdout.strip()
        if stdout:
            return stdout

        # Defensive fallback for builds that route generation differently.
        ignored_prefixes = (
            "loading model",
            "available commands",
            "/exit",
            "/regen",
            "/clear",
            "/read",
            "/glob",
            "exiting",
            "llama_",
            "ggml_",
            "main:",
            "system_info:",
            "build:",
            "version:",
        )

        candidates: list[str] = []
        for raw_line in stderr.splitlines():
            line = raw_line.strip()
            if not line:
                continue

            lowered = line.lower()
            if lowered.startswith(ignored_prefixes):
                continue
            if line.startswith(">"):
                continue

            candidates.append(line)

        return candidates[-1] if candidates else ""

    @staticmethod
    def _clean_commit_message(text: str) -> str:
        """Convert model output to one safe, short commit subject."""
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if not lines:
            return ""

        # Prefer the final useful line because some llama.cpp builds may emit
        # small informational lines before the generation.
        message = lines[-1].strip("`'\" ")

        for prefix in ("commit message:", "subject:"):
            if message.lower().startswith(prefix):
                message = message[len(prefix):].strip()

        # Remove common markdown bullet prefixes if the model ignored prompt.
        message = re.sub(r"^[-*•]\s+", "", message).strip()

        # Make sure Git receives only one line and keep the conventional limit.
        message = " ".join(message.split())
        return message[:72].rstrip()

    @staticmethod
    def _short_error(stderr: str, max_chars: int = 500) -> str:
        """Keep command-line errors readable."""
        text = " ".join(stderr.split())
        return text[:max_chars]
