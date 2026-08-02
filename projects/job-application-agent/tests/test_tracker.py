from pathlib import Path

import pytest

from app.core.schemas import ApplicationRecord, Decision
from app.storage.tracker import ApplicationTracker


def record(status: str = "draft") -> ApplicationRecord:
    return ApplicationRecord(
        title="AI Engineer", organization="Example", country="Australia",
        profile="ai_resume", eligibility=Decision.APPLY,
        original_job_text="Original advertisement", status=status,
    )


def test_tracker_saves_draft(tmp_path: Path) -> None:
    tracker = ApplicationTracker(tmp_path / "applications.sqlite3")
    assert tracker.save(record()) == 1
    assert tracker.list_recent()[0]["organization"] == "Example"


def test_tracker_blocks_submitted_state(tmp_path: Path) -> None:
    tracker = ApplicationTracker(tmp_path / "applications.sqlite3")
    with pytest.raises(ValueError):
        tracker.save(record("submitted"))

