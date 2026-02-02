from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.modules.specializations.schemas import SpecializationOut


class LawyerSummaryOut(BaseModel):
    id: int
    full_name: str
    profile_id: Optional[int] = None
    district: Optional[str] = None
    verified: Optional[bool] = None


class CaseCreate(BaseModel):
    title: str
    specialization_id: int
    district: str
    summary_public: str
    summary_private: Optional[str] = None


class CaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: int
    title: str
    category: str
    specialization_id: Optional[int] = None
    specialization: Optional[SpecializationOut] = None
    district: str
    summary_public: str
    status: str
    selected_lawyer_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class CaseRequestCreate(BaseModel):
    message: Optional[str] = None


class CaseRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    case_id: int
    lawyer_id: int
    message: Optional[str] = None
    status: str
    created_at: datetime
    lawyer: Optional[LawyerSummaryOut] = None


class LawyerCaseRequestOut(BaseModel):
    id: int
    case_id: int
    status: str
    created_at: datetime
    lawyer_id: Optional[int] = None
    message: Optional[str] = None
    case_title: Optional[str] = None
    district: Optional[str] = None
    category: Optional[str] = None
    specialization_id: Optional[int] = None
    specialization_name: Optional[str] = None
