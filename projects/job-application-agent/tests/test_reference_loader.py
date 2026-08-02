from pathlib import Path

from app.services.reference_loader import load_references


def test_loader_deduplicates_and_reports(tmp_path: Path) -> None:
    (tmp_path / "README.md").write_text("Folder instructions", encoding="utf-8")
    (tmp_path / "one.txt").write_text("same content", encoding="utf-8")
    (tmp_path / "two.md").write_text("same   content", encoding="utf-8")
    result = load_references(tmp_path)
    assert len(result.documents) == 1
    assert result.documents[0].name == "one.txt"
    assert len(result.errors) == 1
