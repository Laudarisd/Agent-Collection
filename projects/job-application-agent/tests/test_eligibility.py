from pathlib import Path

from app.core.schemas import Decision, JobPosting
from app.core.settings import load_settings
from app.services.eligibility import evaluate_eligibility, select_profile

CONFIG = load_settings(Path(__file__).parents[1]).config


def job(title: str, country: str | None) -> JobPosting:
    return JobPosting(title=title, country=country, original_text="original")


def test_australian_industry_role_is_allowed() -> None:
    result = evaluate_eligibility(job("Machine Learning Engineer", "Australia"), CONFIG)
    assert result.decision == Decision.APPLY
    assert select_profile(job("Machine Learning Engineer", "Australia"), result.category).profile == "ml_resume"


def test_non_australian_industry_role_is_rejected() -> None:
    result = evaluate_eligibility(job("Data Scientist", "Canada"), CONFIG)
    assert result.decision == Decision.REJECT


def test_canadian_postdoc_is_allowed() -> None:
    result = evaluate_eligibility(job("Postdoctoral Fellow", "Canada"), CONFIG)
    assert result.decision == Decision.APPLY
    assert select_profile(job("Postdoctoral Fellow", "Canada"), result.category).profile == "postdoctoral_resume"


def test_missing_country_requires_review() -> None:
    assert evaluate_eligibility(job("AI Engineer", None), CONFIG).decision == Decision.REVIEW


def test_sensitive_requirement_requires_review() -> None:
    posting = job("AI Engineer", "Australia")
    posting.citizenship_or_clearance = ["Australian citizenship required"]
    assert evaluate_eligibility(posting, CONFIG).decision == Decision.REVIEW

