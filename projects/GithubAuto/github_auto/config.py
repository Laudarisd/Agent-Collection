from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class GitHubSettings:
    create_remote_if_missing: bool
    initialize_plain_folders: bool
    default_visibility: str
    remote_name: str
    api_timeout_seconds: int


@dataclass(frozen=True)
class GitSettings:
    auto_commit: bool
    auto_pull: bool
    auto_merge: bool
    auto_push: bool


@dataclass(frozen=True)
class LLMSettings:
    model_path: Path
    executable: str
    max_tokens: int
    temperature: float
    timeout_seconds: int


@dataclass(frozen=True)
class AppConfig:
    project_root: Path
    repo_dir: Path
    repositories: list[str]
    github: GitHubSettings
    git: GitSettings
    llm: LLMSettings


def _resolve_project_path(value: str) -> Path:
    """Resolve relative paths from the GithubAuto project directory."""
    path = Path(value).expanduser()
    if path.is_absolute():
        return path
    return (PROJECT_ROOT / path).resolve()


def _required_mapping(data: dict[str, Any], key: str) -> dict[str, Any]:
    """Read and validate a required YAML mapping."""
    value = data.get(key)
    if not isinstance(value, dict):
        raise ValueError(f"config.yaml: '{key}' must be a mapping.")
    return value


def load_config() -> AppConfig:
    """Load .env and config.yaml and return validated application settings."""
    load_dotenv(PROJECT_ROOT / ".env")

    config_path = PROJECT_ROOT / "config.yaml"
    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    with config_path.open("r", encoding="utf-8") as file:
        raw = yaml.safe_load(file) or {}

    if not isinstance(raw, dict):
        raise ValueError("config.yaml must contain a YAML mapping.")

    repo_dir_value = raw.get("repo_dir", "./repo")
    if not isinstance(repo_dir_value, str) or not repo_dir_value.strip():
        raise ValueError("config.yaml: 'repo_dir' must be a non-empty string.")

    repositories = raw.get("repositories", [])
    if not isinstance(repositories, list) or not all(
        isinstance(item, str) and item.strip() for item in repositories
    ):
        raise ValueError(
            "config.yaml: 'repositories' must be a list of non-empty Git URLs."
        )

    github_raw = _required_mapping(raw, "github")
    git_raw = _required_mapping(raw, "git")
    llm_raw = _required_mapping(raw, "llm")

    visibility = str(github_raw.get("default_visibility", "private")).lower()
    if visibility not in {"private", "public"}:
        raise ValueError(
            "config.yaml: github.default_visibility must be 'private' or 'public'."
        )

    model_path_value = llm_raw.get("model_path", "")
    if not isinstance(model_path_value, str) or not model_path_value.strip():
        raise ValueError("config.yaml: llm.model_path must be a non-empty string.")

    config = AppConfig(
        project_root=PROJECT_ROOT,
        repo_dir=_resolve_project_path(repo_dir_value),
        repositories=[item.strip() for item in repositories],
        github=GitHubSettings(
            create_remote_if_missing=bool(
                github_raw.get("create_remote_if_missing", True)
            ),
            initialize_plain_folders=bool(
                github_raw.get("initialize_plain_folders", True)
            ),
            default_visibility=visibility,
            remote_name=str(github_raw.get("remote_name", "origin")).strip(),
            api_timeout_seconds=int(github_raw.get("api_timeout_seconds", 30)),
        ),
        git=GitSettings(
            auto_commit=bool(git_raw.get("auto_commit", True)),
            auto_pull=bool(git_raw.get("auto_pull", True)),
            auto_merge=bool(git_raw.get("auto_merge", True)),
            auto_push=bool(git_raw.get("auto_push", True)),
        ),
        llm=LLMSettings(
            model_path=_resolve_project_path(model_path_value),
            executable=str(llm_raw.get("executable", "llama-cli")).strip(),
            max_tokens=int(llm_raw.get("max_tokens", 80)),
            temperature=float(llm_raw.get("temperature", 0.2)),
            timeout_seconds=int(llm_raw.get("timeout_seconds", 180)),
        ),
    )

    config.repo_dir.mkdir(parents=True, exist_ok=True)
    return config
