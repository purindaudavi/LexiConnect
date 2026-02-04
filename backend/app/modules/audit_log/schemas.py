from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel, ConfigDict


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_user_id: Optional[int] = None
    actor_email: Optional[str] = None
    actor_role: Optional[str] = None
    user_id: Optional[int] = None
    action: str
    description: str
    meta: Optional[Any] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    success: Optional[bool] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime


class AuditLogListOut(BaseModel):
    items: List[AuditLogOut]
    total: int
    page: int
    page_size: int
