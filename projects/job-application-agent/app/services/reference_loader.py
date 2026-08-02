"""Extract text from supported reference resume and cover-letter files."""

from __future__ import annotations

import hashlib
from pathlib import Path

import docx2txt
from pypdf import PdfReader

from app.core.schemas import ReferenceDocument, ReferenceLoadResult

SUPPORTED_SUFFIXES = {".txt", ".md", ".docx", ".pdf"}


def load_references(directory: Path) -> ReferenceLoadResult:
    """Load every supported reference and report every extraction failure."""
    documents: list[ReferenceDocument] = []
    errors: list[str] = []
    fingerprints: set[str] = set()
    if not directory.exists():
        return ReferenceLoadResult(documents=[], errors=[f"Missing reference folder: {directory}"])
    for path in sorted(directory.iterdir()):
        if path.name.casefold() == "readme.md":
            continue
        if not path.is_file() or path.suffix.lower() not in SUPPORTED_SUFFIXES:
            continue
        try:
            text = _extract_text(path).strip()
            if not text:
                raise ValueError("no readable text")
            fingerprint = hashlib.sha256(" ".join(text.split()).encode()).hexdigest()
            if fingerprint in fingerprints:
                errors.append(f"Duplicate ignored: {path.name}")
                continue
            fingerprints.add(fingerprint)
            documents.append(ReferenceDocument(name=path.name, path=str(path), text=text))
        except Exception as error:  # extraction libraries raise several file-specific errors
            errors.append(f"Could not read {path.name}: {error}")
    return ReferenceLoadResult(documents=documents, errors=errors)


def _extract_text(path: Path) -> str:
    if path.suffix.lower() in {".txt", ".md"}:
        return path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".docx":
        return docx2txt.process(str(path))
    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)
