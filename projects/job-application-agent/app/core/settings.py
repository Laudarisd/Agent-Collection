"""Load environment and user-editable YAML settings."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv
from pydantic import BaseModel, Field, model_validator


class ApprovalSettings(BaseModel):
    apply_score: int = Field(75, ge=0, le=100)
    review_score: int = Field(50, ge=0, le=100)
    require_human_submission_approval: bool = True

    @model_validator(mode="after")
    def validate_thresholds(self) -> "ApprovalSettings":
        if self.review_score > self.apply_score:
            raise ValueError("review_score cannot exceed apply_score")
        return self


class AgentConfig(BaseModel):
    countries: dict[str, list[str]]
    roles: dict[str, list[str]]
    research_keywords: list[str]
    profile_directories: dict[str, str]
    cover_letter_directories: dict[str, str]
    matching_weights: dict[str, float]
    approval: ApprovalSettings


class Settings(BaseModel):
    project_root: Path
    config_path: Path
    llama_server_url: str
    llama_model_path: Path
    database_path: Path
    output_dir: Path
    config: AgentConfig


def load_settings(project_root: Path | None = None) -> Settings:
    """Load `.env` and validate the YAML configuration."""
    root = (project_root or Path(__file__).resolve().parents[2]).resolve()
    load_dotenv(root / ".env")
    config_path = root / os.getenv("JOB_AGENT_CONFIG", "config/job_agent.yaml")
    with config_path.open(encoding="utf-8") as config_file:
        raw_config: dict[str, Any] = yaml.safe_load(config_file)
    return Settings(
        project_root=root,
        config_path=config_path,
        llama_server_url=os.getenv("LLAMA_SERVER_URL", "http://127.0.0.1:8080").rstrip("/"),
        llama_model_path=root / os.getenv(
            "LLAMA_MODEL_PATH", "models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
        ),
        database_path=root / os.getenv("APPLICATION_DB", "data/applications.sqlite3"),
        output_dir=root / os.getenv("OUTPUT_DIR", "outputs"),
        config=AgentConfig.model_validate(raw_config),
    )

