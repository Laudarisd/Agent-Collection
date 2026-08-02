from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Prompt, User
from .auth import get_current_user


router = APIRouter(prefix="/api/results", tags=["results"])


@router.get("/{prompt_id}")
def get_result(
    prompt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = db.get(Prompt, prompt_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result not found")

    return {
        "id": row.id,
        "status": row.status,
        "response": row.response_text,
        "created_at": row.created_at,
    }
