"""Turn an unmodified advertisement into validated structured fields."""

from app.core.schemas import JobPosting
from app.services.llm_client import LocalLLMClient


def parse_job(client: LocalLLMClient, job_text: str) -> JobPosting:
    """Parse a job without filling absent facts."""
    if not job_text.strip():
        raise ValueError("Job description is empty")
    posting = client.structured(
        "You extract job advertisements. Never infer missing facts; use null or empty lists. "
        "The application will preserve the original input separately.",
        job_text,
        JobPosting,
    )
    # Do not rely on a model to reproduce the source advertisement losslessly.
    posting.original_text = job_text
    return posting
