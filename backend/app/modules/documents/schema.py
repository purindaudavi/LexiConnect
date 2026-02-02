from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class DocumentCommentCreate(BaseModel):
    comment_text: str


class DocumentCommentOut(BaseModel):
    id: int
    document_id: int
    comment_text: str
    created_by_user_id: Optional[int] = None
    created_by_role: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentOut(BaseModel):
    id: int
    booking_id: Optional[int] = None
    uploaded_by_user_id: Optional[int] = None
    uploaded_by_role: Optional[str] = None
    case_id: Optional[int] = None
    title: Optional[str] = None
    file_path: str
    file_url: Optional[str] = None
    uploaded_at: datetime
    comment_count: int = 0
    latest_comment: Optional[DocumentCommentOut] = None

    model_config = ConfigDict(from_attributes=True)



class DocumentReviewLinkCreate(BaseModel):
    review_link: str
    note: Optional[str] = None


class DocumentReviewLinkOut(BaseModel):
    id: int
    document_id: int
    apprentice_id: int
    review_link: str
    note: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True