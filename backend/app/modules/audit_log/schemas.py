from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel, ConfigDict


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: Optional[int] = None
    user_email: Optional[str] = None
    action: str
    description: str
    meta: Optional[Any] = None
    created_at: datetime


class AuditLogListOut(BaseModel):
    items: List[AuditLogOut]
    total: int
    page: int
    page_size: int
