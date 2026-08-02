from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ChatSession, User
from ..schemas import SessionCreateRequest, SessionRenameRequest, SessionResponse
from .auth import get_current_user


router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.get("", response_model=list[SessionResponse])
def list_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == current_user.id, ChatSession.deleted_at.is_(None))
        .order_by(ChatSession.updated_at.desc())
        .all()
    )
    return [SessionResponse.model_validate(row) for row in rows]


@router.post("", response_model=SessionResponse)
def create_session(
    payload: SessionCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = ChatSession(
        user_id=current_user.id,
        title=payload.title.strip() or "New Session",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return SessionResponse.model_validate(row)


@router.post("/clear", status_code=status.HTTP_200_OK)
def clear_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    rows = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == current_user.id, ChatSession.deleted_at.is_(None))
        .all()
    )
    for row in rows:
        row.deleted_at = now
        row.updated_at = now
        db.add(row)
    db.commit()
    return {"hidden_sessions": len(rows)}


@router.patch("/{session_id}", response_model=SessionResponse)
def rename_session(
    session_id: int,
    payload: SessionRenameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(ChatSession, session_id)
    if not row or row.user_id != current_user.id or row.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    row.title = payload.title.strip()
    row.updated_at = datetime.utcnow()
    row.renamed_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return SessionResponse.model_validate(row)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(ChatSession, session_id)
    if not row or row.user_id != current_user.id or row.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    row.deleted_at = datetime.utcnow()
    row.updated_at = datetime.utcnow()
    db.add(row)
    db.commit()
