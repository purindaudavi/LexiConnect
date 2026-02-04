from __future__ import annotations

from datetime import datetime
from typing import Optional, Literal, List

from pydantic import BaseModel, ConfigDict, Field


class CaseCommentCreate(BaseModel):
    content: str = Field(..., min_length=2)
    parent_id: Optional[int] = None


class CaseCommentNode(BaseModel):
    id: int
    case_id: int
    parent_id: Optional[int] = None
    content: str
    created_at: datetime
    updated_at: datetime
    author_id: int
    author_display_name: str
    author_name: Optional[str] = None
    author_role: str
    score: int
    my_vote: int = 0
    user_vote: int = 0
    reply_count: int
    replies: List[CaseCommentNode] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class CaseCommentOut(CaseCommentNode):
    user_id: int


class CaseCommentListOut(BaseModel):
    items: List[CaseCommentNode]


class CaseCommentVoteCreate(BaseModel):
    vote: Literal[-1, 0, 1]


class PublicCommentVoteCreate(BaseModel):
    value: Literal[-1, 0, 1]


class CaseCommentVoteOut(BaseModel):
    comment_id: int
    score: int
    my_vote: int = 0

    model_config = ConfigDict(from_attributes=True)
