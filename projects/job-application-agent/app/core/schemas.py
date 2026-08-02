"""Validated values exchanged by services and the UI."""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class Decision(StrEnum):
    APPLY = "apply"
    REVIEW = "review"
    REJECT = "reject"


class JobPosting(BaseModel):
    title: str = "Unknown"
    organization: str = "Unknown"
    country: str | None = None
    city: str | None = None
    work_mode: str | None = None
    employment_type: str | None = None
    responsibilities: list[str] = Field(default_factory=list)
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    required_education: list[str] = Field(default_factory=list)
    required_experience: list[str] = Field(default_factory=list)
    research_topics: list[str] = Field(default_factory=list)
    citizenship_or_clearance: list[str] = Field(default_factory=list)
    visa_or_work_authorization: list[str] = Field(default_factory=list)
    salary: str | None = None
    closing_date: date | None = None
    application_url: str | None = None
    required_documents: list[str] = Field(default_factory=list)
    original_text: str


class EligibilityResult(BaseModel):
    decision: Decision
    category: str | None = None
    reasons: list[str]
    requires_human_review: bool = False


class ProfileSelection(BaseModel):
    profile: str
    reason: str


class ReferenceDocument(BaseModel):
    name: str
    path: str
    text: str


class ReferenceLoadResult(BaseModel):
    documents: list[ReferenceDocument]
    errors: list[str]


class GeneratedDocuments(BaseModel):
    resume_markdown: str
    cover_letter_markdown: str
    evidence_notes: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ApplicationRecord(BaseModel):
    id: int | None = None
    created_at: datetime | None = None
    title: str
    organization: str
    country: str | None = None
    url: str | None = None
    status: str = "draft"
    profile: str
    eligibility: Decision
    original_job_text: str
    resume_markdown: str | None = None
    cover_letter_markdown: str | None = None
    warnings: list[str] = Field(default_factory=list)

