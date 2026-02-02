import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.modules.queue.models import QueueEntryStatus


class TokenQueueCreate(BaseModel):
    date: date
    token_number: int
    time: Optional[str] = None
    lawyer_id: int
    client_id: int
    branch_id: Optional[int] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[QueueEntryStatus] = None


class TokenQueueUpdate(BaseModel):
    status: QueueEntryStatus
    notes: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class TokenQueueOut(BaseModel):
    id: uuid.UUID
    date: date
    token_number: int
    time: Optional[str]
    lawyer_id: int
    client_id: int
    client_name: Optional[str] = None
    branch_id: Optional[int]
    reason: Optional[str]
    notes: Optional[str]
    status: QueueEntryStatus
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

