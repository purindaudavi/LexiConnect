from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


from os import getenv

ALLOW_LEGACY = getenv("ALLOW_LEGACY_BOOKING", "").lower() == "true"


class BookingCreate(BaseModel):
    lawyer_id: int
    branch_id: Optional[int] = None
    scheduled_at: Optional[datetime] = None
    note: Optional[str] = None
    service_package_id: Optional[int] = None
    case_id: int | None = None if ALLOW_LEGACY else ...  # required unless legacy flag set


class BookingOut(BaseModel):
    id: int
    client_id: int
    lawyer_id: int
    branch_id: Optional[int] = None
    service_package_id: Optional[int] = None
    case_id: Optional[int] = None
    scheduled_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    note: Optional[str] = None
    status: str
    blocks_time: Optional[bool] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BookingSummaryOut(BaseModel):
    id: int
    client_id: int
    lawyer_id: int
    branch_id: Optional[int] = None
    service_package_id: Optional[int] = None
    case_id: Optional[int] = None
    scheduled_at: Optional[datetime] = None
    note: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime
    lawyer_name: Optional[str] = None
    lawyer_specialization: Optional[str] = None
    lawyer_city: Optional[str] = None
    lawyer_district: Optional[str] = None
    branch_name: Optional[str] = None
    branch_city: Optional[str] = None
    service_name: Optional[str] = None
    case_title: Optional[str] = None
    case_summary: Optional[str] = None


class BookingUpdate(BaseModel):
    lawyer_id: Optional[int] = None
    branch_id: Optional[int] = None
    scheduled_at: Optional[datetime] = None
    note: Optional[str] = None
    status: Optional[str] = None
    service_package_id: Optional[int] = None
    case_id: Optional[int] = None


class BookingCancelOut(BaseModel):
    id: int
    status: str

    model_config = ConfigDict(from_attributes=True)


class BookingSlotOut(BaseModel):
    start: str
    end: str
    branch_id: int
    branch_name: Optional[str] = None
    duration_minutes: int


class BookingSlotsByDateOut(BaseModel):
    date: str
    slots: list[BookingSlotOut]


class BookingDraftCreate(BaseModel):
    lawyer_id: int
    scheduled_at: Optional[datetime] = None
    service_package_id: Optional[int] = None
    client_note: Optional[str] = None
    case_id: Optional[int] = None


class BookingDraftOut(BaseModel):
    id: int
    status: str
    lawyer_id: int
    client_id: int
    service_package_id: Optional[int] = None
    case_id: Optional[int] = None
    scheduled_at: Optional[datetime] = None
    note: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
