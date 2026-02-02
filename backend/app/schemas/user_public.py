from datetime import datetime
from pydantic import BaseModel


class UserMeOut(BaseModel):
    id: int
    full_name: str
    email: str  # ✅ allow dev emails like apprentice@lexiconnect.local
    role: str
    roles: list[str]
    effective_privileges: list[str]
    created_at: datetime


class UserPublicOut(BaseModel):
    id: int
    full_name: str
    role: str
