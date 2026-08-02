from fastapi import APIRouter

from .admin import router as admin_router
from .auth import router as auth_router
from .prompts import router as prompts_router
from .results import router as results_router
from .sessions import router as sessions_router


api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(sessions_router)
api_router.include_router(prompts_router)
api_router.include_router(results_router)
api_router.include_router(admin_router)
