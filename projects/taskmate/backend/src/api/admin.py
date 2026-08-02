from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends

from ..database import get_db
from ..models import Prompt, User
from .auth import get_admin_user


router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/overview")
def get_admin_overview(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    user_count = db.query(func.count(User.id)).scalar() or 0
    prompt_count = db.query(func.count(Prompt.id)).scalar() or 0
    return {
        "user_count": user_count,
        "prompt_count": prompt_count,
    }


@router.get("/users")
def get_users(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    rows = db.query(User).order_by(User.created_at.desc()).all()
    return [
        {
            "id": row.id,
            "name": row.name,
            "email": row.email,
            "created_at": row.created_at,
        }
        for row in rows
    ]


@router.get("/prompts")
def get_all_prompts(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    rows = (
        db.query(Prompt, User)
        .join(User, Prompt.user_id == User.id)
        .order_by(Prompt.created_at.desc())
        .all()
    )
    return [
        {
            "id": prompt.id,
            "user_id": user.id,
            "user_email": user.email,
            "prompt_text": prompt.prompt_text,
            "status": prompt.status,
            "created_at": prompt.created_at,
        }
        for prompt, user in rows
    ]
