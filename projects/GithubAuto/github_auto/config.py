from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class GitHubSettings:
    remote_name: str
    default_visibility: str
    api_timeout_seconds: int


@dataclass(frozen=True)
class GitSettings:
    preferred_divergence_strategy: str
    history_limit: int


@dataclass(frozen=True)
class LLMSettings:
    model_path: Path
    executable: str
    max_tokens: int
    temperature: float
    timeout_seconds: int


@dataclass(frozen=True)
class SafetySettings:
    confirm_destructive_actions: bool
    allow_remote_repo_delete: bool
    allow_hard_reset: bool


@dataclass(frozen=True)
class AppConfig:
    project_root: Path
    repo_dir: Path
    github: GitHubSettings
    git: GitSettings
    llm: LLMSettings
    safety: SafetySettings


def _resolve_path(value: str) -> Path:
    """Resolve a path relative to the GithubAuto project directory."""
    path = Path(value).expanduser()
    if path.is_absolute():
        return path
    return (PROJECT_ROOT / path).resolve()


def _mapping(data: dict[str, Any], key: str) -> dict[str, Any]:
    value = data.get(key)
    if not isinstance(value, dict):
        raise ValueError(f"config.yaml: '{key}' must be a mapping.")
    return value


def load_config() -> AppConfig:
    """Load .env and config.yaml into typed, validated settings."""
    load_dotenv(PROJECT_ROOT / ".env")

    config_path = PROJECT_ROOT / "config.yaml"
    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    with config_path.open("r", encoding="utf-8") as file:
        raw = yaml.safe_load(file) or {}

    if not isinstance(raw, dict):
        raise ValueError("config.yaml must contain a YAML mapping.")

    github_raw = _mapping(raw, "github")
    git_raw = _mapping(raw, "git")
    llm_raw = _mapping(raw, "llm")
    safety_raw = _mapping(raw, "safety")

    repo_dir_raw = str(raw.get("repo_dir", "./repo")).strip()
    if not repo_dir_raw:
        raise ValueError("config.yaml: repo_dir cannot be empty.")

    visibility = str(
        github_raw.get("default_visibility", "private")
    ).strip().lower()
    if visibility not in {"private", "public"}:
        raise ValueError(
            "github.default_visibility must be 'private' or 'public'."
        )

    strategy = str(
        git_raw.get("preferred_divergence_strategy", "rebase")
    ).strip().lower()
    if strategy not in {"rebase", "merge"}:
        raise ValueError(
            "git.preferred_divergence_strategy must be 'rebase' or 'merge'."
        )

    model_raw = str(llm_raw.get("model_path", "")).strip()
    if not model_raw:
        raise ValueError("llm.model_path cannot be empty.")

    repo_dir = _resolve_path(repo_dir_raw)
    repo_dir.mkdir(parents=True, exist_ok=True)

    return AppConfig(
        project_root=PROJECT_ROOT,
        repo_dir=repo_dir,
        github=GitHubSettings(
            remote_name=str(
                github_raw.get("remote_name", "origin")
            ).strip() or "origin",
            default_visibility=visibility,
            api_timeout_seconds=int(
                github_raw.get("api_timeout_seconds", 30)
            ),
        ),
        git=GitSettings(
            preferred_divergence_strategy=strategy,
            history_limit=max(1, int(git_raw.get("history_limit", 15))),
        ),
        llm=LLMSettings(
            model_path=_resolve_path(model_raw),
            executable=str(
                llm_raw.get("executable", "llama-cli")
            ).strip() or "llama-cli",
            max_tokens=max(8, int(llm_raw.get("max_tokens", 48))),
            temperature=float(llm_raw.get("temperature", 0.1)),
            timeout_seconds=max(
                10, int(llm_raw.get("timeout_seconds", 180))
            ),
        ),
        safety=SafetySettings(
            confirm_destructive_actions=bool(
                safety_raw.get("confirm_destructive_actions", True)
            ),
            allow_remote_repo_delete=bool(
                safety_raw.get("allow_remote_repo_delete", False)
            ),
            allow_hard_reset=bool(
                safety_raw.get("allow_hard_reset", False)
            ),
        ),
    )
