from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PublicCaseListItem(BaseModel):
    id: int
    title: str
    district: str
    category: str
    specialization_id: Optional[int] = None
    specialization_name: Optional[str] = None
    created_at: datetime
    comment_count: int

    model_config = ConfigDict(from_attributes=True)


class PublicCaseDetailOut(BaseModel):
    id: int
    title: str
    district: str
    category: str
    specialization_id: Optional[int] = None
    specialization_name: Optional[str] = None
    created_at: datetime
    summary_public: str
    status: Optional[str] = None
    comment_count: int

    model_config = ConfigDict(from_attributes=True)
