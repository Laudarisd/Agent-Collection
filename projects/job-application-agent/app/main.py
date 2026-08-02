"""Streamlit review interface; business rules remain in service modules."""

from __future__ import annotations

import streamlit as st

from app.core.schemas import ApplicationRecord, Decision
from app.core.settings import load_settings
from app.services.document_service import factual_warnings, generate_documents
from app.services.eligibility import evaluate_eligibility, select_profile
from app.services.job_parser import parse_job
from app.services.llm_client import LocalLLMClient, LocalModelError
from app.services.reference_loader import load_references
from app.storage.tracker import ApplicationTracker


@st.cache_resource
def services() -> tuple:
    settings = load_settings()
    return settings, LocalLLMClient(settings.llama_server_url), ApplicationTracker(settings.database_path)


def main() -> None:
    st.set_page_config(page_title="Local Job Agent", page_icon="🎯", layout="wide")
    settings, client, tracker = services()
    st.title("Local Job Application Agent")
    st.caption("Private, evidence-based drafting with mandatory human review and no automatic submission.")
    model_ready = client.is_available()
    with st.sidebar:
        st.subheader("System status")
        if model_ready:
            st.success("Qwen model connected")
        else:
            st.error("Qwen model offline")
        st.caption("Model")
        st.code(settings.llama_model_path.name, language=None)
        st.caption("Private endpoint")
        st.code(settings.llama_server_url, language=None)
        st.link_button("Open this app", "http://localhost:8501", use_container_width=True)
        if st.button("Refresh model status", use_container_width=True):
            st.rerun()
        page = st.radio("Workspace", ["Prepare application", "Tracker"])
    if page == "Tracker":
        st.subheader("Saved applications")
        st.dataframe(tracker.list_recent(), use_container_width=True)
        return
    prepare_application(settings, client, tracker, model_ready)


def prepare_application(
    settings, client: LocalLLMClient, tracker: ApplicationTracker, model_ready: bool
) -> None:
    if not model_ready:
        st.error("The local Qwen model is not running, so job analysis is temporarily unavailable.")
        st.code("./scripts/start_agent.sh", language="bash")
        st.info("Run the command above from the project folder. It starts both the model and this app.")
    job_text = st.text_area("Paste the complete job advertisement", height=280)
    if st.button("Analyze job", type="primary", disabled=not model_ready):
        try:
            job = parse_job(client, job_text)
            eligibility = evaluate_eligibility(job, settings.config)
            profile = select_profile(job, eligibility.category)
            st.session_state.analysis = (job, eligibility, profile)
            st.session_state.pop("documents", None)
        except (ValueError, LocalModelError) as error:
            st.error(f"Analysis could not be completed: {error}")
            st.info("Check System status in the sidebar, then use Refresh model status.")
    if "analysis" not in st.session_state:
        return
    job, eligibility, profile = st.session_state.analysis
    left, right = st.columns(2)
    left.subheader(f"{job.title} — {job.organization}")
    left.write(job.model_dump(exclude={"original_text"}))
    right.subheader(f"Decision: {eligibility.decision.value.upper()}")
    right.write("\n".join(f"- {reason}" for reason in eligibility.reasons))
    right.info(f"Resume profile: {profile.profile}\n\n{profile.reason}")
    if eligibility.decision == Decision.REJECT:
        st.error("This job is outside the configured scope. Document generation is blocked.")
        return
    if st.button("Generate factual drafts"):
        resume_dir = settings.project_root / settings.config.profile_directories[profile.profile]
        letter_group = "research" if eligibility.category == "research" else "industry"
        letter_dir = settings.project_root / settings.config.cover_letter_directories[letter_group]
        resumes, letters = load_references(resume_dir), load_references(letter_dir)
        for warning in resumes.errors + letters.errors:
            st.warning(warning)
        try:
            docs = generate_documents(client, job, resumes.documents, letters.documents)
            docs.warnings = factual_warnings(job, docs)
            st.session_state.documents = docs
        except (ValueError, LocalModelError) as error:
            st.error(str(error))
    if "documents" not in st.session_state:
        return
    docs = st.session_state.documents
    resume_tab, letter_tab, check_tab = st.tabs(["Resume draft", "Cover letter", "Checks"])
    resume_tab.markdown(docs.resume_markdown)
    letter_tab.markdown(docs.cover_letter_markdown)
    check_tab.write(docs.warnings or ["No deterministic warnings found; human review is still required."])
    reviewed = st.checkbox("I reviewed both drafts and their factual warnings")
    if st.button("Save reviewed draft", disabled=not reviewed):
        record_id = tracker.save(ApplicationRecord(
            title=job.title, organization=job.organization, country=job.country,
            url=job.application_url, profile=profile.profile, eligibility=eligibility.decision,
            original_job_text=job.original_text, resume_markdown=docs.resume_markdown,
            cover_letter_markdown=docs.cover_letter_markdown, warnings=docs.warnings,
            status="reviewed_draft",
        ))
        st.success(f"Saved application draft #{record_id}. Final submission is not automated.")


if __name__ == "__main__":
    main()
