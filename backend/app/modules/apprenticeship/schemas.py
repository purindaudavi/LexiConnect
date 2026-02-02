from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class AssignApprenticeRequest(BaseModel):
    case_id: int
    apprentice_id: int


class CaseApprenticeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    case_id: int
    lawyer_id: int
    apprentice_id: int
    created_at: datetime

    # lawyer info
    lawyer_full_name: Optional[str] = None
    lawyer_email: Optional[str] = None

    # case info
    case_title: Optional[str] = None
    case_category: Optional[str] = None
    case_status: Optional[str] = None
    district: Optional[str] = None

    # matches frontend normalizeCase()
    supervising_lawyer: Optional[str] = None
    lawyer_name: Optional[str] = None
    lawyer: Optional[str] = None


class ApprenticeNoteCreate(BaseModel):
    note: str


class ApprenticeNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    case_id: int
    apprentice_id: int
    note: str
    created_at: datetime

    # ✅ NEW (for chat UI)
    author_id: Optional[int] = None
    author_role: Optional[str] = None
    author_name: Optional[str] = None



class ApprenticeChoiceOut(BaseModel):
    id: int
    full_name: str
    email: str


class CaseChoiceOut(BaseModel):
    id: int
    title: str
    district: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None
