from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr

from app.models.user import UserRole  # ✅ use the same enum as your SQLAlchemy model


class UserBase(BaseModel):
    full_name: str
    email: EmailStr
    phone: Optional[str] = None
    role: UserRole = UserRole.client  # ✅ validated enum (client/lawyer/admin/apprentice)


class UserCreate(UserBase):
    password: str


class UserOut(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True  # ✅ pydantic v2 (works better than orm_mode)
