from datetime import datetime
from typing import Optional
import uuid

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=2)


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CompanyOut(BaseModel):
    id: str
    name: str
    inn: Optional[str] = None
    role: str


class CompanyCreate(BaseModel):
    name: str = Field(min_length=2)
    inn: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    companies: list[CompanyOut]


class MessageResponse(BaseModel):
    message: str
