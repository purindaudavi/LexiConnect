from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuthLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    occurred_at: datetime
    created_at: Optional[str] = None
    event_type: str
    user_id: Optional[UUID] = None
    user_name: Optional[str] = None
    email: Optional[str] = None
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    success: bool
    failure_reason: Optional[str] = None
    method: Optional[str] = None


class AuthLogListOut(BaseModel):
    items: List[AuthLogOut]
    page: int
    page_size: int
    total: int
