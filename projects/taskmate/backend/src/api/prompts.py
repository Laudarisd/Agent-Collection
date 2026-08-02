from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ChatSession, Prompt, User
from ..schemas import PromptCreateRequest, PromptResponse
from ..services.gemini_test_service import generate_test_response
from .auth import get_current_user


router = APIRouter(prefix="/api/prompts", tags=["prompts"])


@router.post("", response_model=PromptResponse)
def create_prompt(
    payload: PromptCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.get(ChatSession, payload.session_id)
    if not session or session.user_id != current_user.id or session.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    prompt = Prompt(
        user_id=current_user.id,
        session_id=session.id,
        prompt_text=payload.prompt.strip(),
        response_text=None,
        status="processing",
        created_at=datetime.utcnow(),
    )
    model_output, model_status = generate_test_response(payload.prompt)
    prompt.response_text = model_output
    prompt.status = model_status

    db.add(prompt)
    session.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(prompt)
    return PromptResponse.model_validate(prompt)


@router.get("/history", response_model=list[PromptResponse])
def get_prompt_history(
    session_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        db.query(Prompt)
        .join(ChatSession, Prompt.session_id == ChatSession.id)
        .filter(
            Prompt.user_id == current_user.id,
            ChatSession.user_id == current_user.id,
            ChatSession.deleted_at.is_(None),
        )
    )
    if session_id is not None:
        session = db.get(ChatSession, session_id)
        if not session or session.user_id != current_user.id or session.deleted_at is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        query = query.filter(Prompt.session_id == session_id)
    rows = query.order_by(Prompt.created_at.asc()).all()
    return [PromptResponse.model_validate(row) for row in rows]


@router.get("/{prompt_id}", response_model=PromptResponse)
def get_prompt_by_id(
    prompt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(Prompt, prompt_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    if row.session_id is not None:
        session = db.get(ChatSession, row.session_id)
        if not session or session.user_id != current_user.id or session.deleted_at is not None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt not found")
    return PromptResponse.model_validate(row)
