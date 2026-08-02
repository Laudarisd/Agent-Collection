from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserRegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class UserLoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    is_admin: bool = False
    created_at: datetime


class AuthResponse(BaseModel):
    token: str
    user: UserResponse


class PromptCreateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    session_id: int


class PromptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    session_id: int | None
    prompt_text: str
    response_text: str | None
    status: str
    created_at: datetime


class SessionCreateRequest(BaseModel):
    title: str = Field(default="New Session", min_length=1, max_length=200)


class SessionRenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class SessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    title: str
    created_at: datetime
    updated_at: datetime
