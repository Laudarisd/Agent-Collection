"""SQLite application tracker with explicit draft states."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from app.core.schemas import ApplicationRecord


class ApplicationTracker:
    def __init__(self, database_path: Path) -> None:
        database_path.parent.mkdir(parents=True, exist_ok=True)
        self.database_path = database_path
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS applications (
                    id INTEGER PRIMARY KEY,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    title TEXT NOT NULL,
                    organization TEXT NOT NULL,
                    country TEXT,
                    url TEXT,
                    status TEXT NOT NULL,
                    profile TEXT NOT NULL,
                    eligibility TEXT NOT NULL,
                    original_job_text TEXT NOT NULL,
                    resume_markdown TEXT,
                    cover_letter_markdown TEXT,
                    warnings_json TEXT NOT NULL
                )
            """)

    def save(self, record: ApplicationRecord) -> int:
        """Save a reviewed draft; this method cannot mark an application submitted."""
        if record.status == "submitted":
            raise ValueError("Submission requires a separate explicit approval workflow")
        with self._connect() as connection:
            cursor = connection.execute(
                """INSERT INTO applications
                (title, organization, country, url, status, profile, eligibility,
                 original_job_text, resume_markdown, cover_letter_markdown, warnings_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    record.title, record.organization, record.country, record.url, record.status,
                    record.profile, record.eligibility.value, record.original_job_text,
                    record.resume_markdown, record.cover_letter_markdown, json.dumps(record.warnings),
                ),
            )
            return int(cursor.lastrowid)

    def list_recent(self, limit: int = 50) -> list[dict[str, object]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM applications ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(row) for row in rows]

