"""Deterministic scope filter and resume-profile selection."""

from __future__ import annotations

from app.core.schemas import Decision, EligibilityResult, JobPosting, ProfileSelection
from app.core.settings import AgentConfig


def evaluate_eligibility(job: JobPosting, config: AgentConfig) -> EligibilityResult:
    """Apply location and role rules before any subjective model scoring."""
    if not job.country:
        return EligibilityResult(
            decision=Decision.REVIEW,
            reasons=["Country is missing and must be confirmed."],
            requires_human_review=True,
        )
    category = classify_role(job, config)
    if category is None:
        return EligibilityResult(decision=Decision.REJECT, reasons=["Role is outside the configured target scope."])
    allowed = config.countries[category]
    if normalize_country(job.country) not in {normalize_country(country) for country in allowed}:
        return EligibilityResult(
            decision=Decision.REJECT,
            category=category,
            reasons=[f"{category.title()} roles are only allowed in: {', '.join(allowed)}."],
        )
    sensitive = job.citizenship_or_clearance + job.visa_or_work_authorization
    if sensitive:
        return EligibilityResult(
            decision=Decision.REVIEW,
            category=category,
            reasons=["Citizenship, clearance, visa, or work authorization requires human review."],
            requires_human_review=True,
        )
    return EligibilityResult(
        decision=Decision.APPLY,
        category=category,
        reasons=["Role category and country match the configured scope."],
    )


def classify_role(job: JobPosting, config: AgentConfig) -> str | None:
    title = job.title.casefold()
    research_markers = ("postdoc", "research fellow", "research associate", "research scientist")
    if any(marker in title for marker in research_markers):
        return "research"
    if any(role.casefold() in title or title in role.casefold() for role in config.roles["industry"]):
        return "industry"
    combined = " ".join([title, *job.research_topics, *job.required_skills]).casefold()
    if "research" in title and any(keyword in combined for keyword in config.research_keywords):
        return "research"
    return None


def select_profile(job: JobPosting, category: str | None) -> ProfileSelection:
    """Choose one factual source group with an auditable reason."""
    if category == "research":
        return ProfileSelection(profile="postdoctoral_resume", reason="Research role requires the academic CV source.")
    text = " ".join([job.title, *job.required_skills, *job.research_topics]).casefold()
    if any(term in text for term in ("data scientist", "statistics", "analytics")):
        return ProfileSelection(profile="data_science_resume", reason="The role emphasizes data science and statistics.")
    if any(term in text for term in ("machine learning", "ml engineer", "time-series", "forecast")):
        return ProfileSelection(profile="ml_resume", reason="The role emphasizes machine-learning engineering.")
    return ProfileSelection(profile="ai_resume", reason="The role most closely matches the general AI profile.")


def normalize_country(country: str) -> str:
    aliases = {"usa": "united states", "us": "united states", "u.s.": "united states", "nz": "new zealand"}
    normalized = country.strip().casefold()
    return aliases.get(normalized, normalized)

