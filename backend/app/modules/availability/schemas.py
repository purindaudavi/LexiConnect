import uuid
from datetime import datetime, time

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AvailabilityTemplateCreate(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6)
    start_time: time
    end_time: time
    slot_minutes: int = Field(default=30, ge=5, le=240)
    is_active: bool = True

    @model_validator(mode="after")
    def validate_time_range(self):
        if self.start_time >= self.end_time:
            raise ValueError("start_time must be before end_time")
        return self


class AvailabilityTemplateUpdate(BaseModel):
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    start_time: time | None = None
    end_time: time | None = None
    slot_minutes: int | None = Field(default=None, ge=5, le=240)
    is_active: bool | None = None

    @model_validator(mode="after")
    def validate_time_range(self):
        if self.start_time is not None and self.end_time is not None:
            if self.start_time >= self.end_time:
                raise ValueError("start_time must be before end_time")
        return self


class AvailabilityTemplateOut(BaseModel):
    id: uuid.UUID
    lawyer_id: int
    lawyer_user_id: int | None = None
    day_of_week: int
    start_time: time
    end_time: time
    slot_minutes: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def hydrate_lawyer_user_id(self):
        if self.lawyer_user_id is None:
            self.lawyer_user_id = self.lawyer_id
        return self

    model_config = ConfigDict(from_attributes=True)


class BookableSlot(BaseModel):
    start_time: str
    end_time: str
    branch_id: int | None = None
    branch_name: str | None = None
    duration_minutes: int | None = None


class BookableSlotsByDate(BaseModel):
    date: str
    slots: list[BookableSlot]
