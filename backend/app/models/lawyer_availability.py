from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey, Time, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from ..database import Base


class WeekDay(enum.Enum):
    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"
    FRIDAY = "friday"
    SATURDAY = "saturday"
    SUNDAY = "sunday"


class AvailabilityType(enum.Enum):
    WEEKLY = "weekly"
    BLACKOUT = "blackout"


class WeeklyAvailability(Base):
    """Weekly recurring availability slots for lawyers"""
    __tablename__ = "weekly_availability"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=False, index=True)
    location = Column(String(255), nullable=True)
    
    # Weekly schedule
    day_of_week = Column(Enum(WeekDay), nullable=False, index=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    max_bookings = Column(Integer, nullable=False, default=5)
    
    # Metadata
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class BlackoutDate(Base):
    """Specific dates when lawyers are unavailable"""
    __tablename__ = "blackout_dates"

    id = Column(Integer, primary_key=True, index=True)
    lawyer_id = Column(Integer, ForeignKey("lawyers.id"), nullable=False, index=True)
    lawyer_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    
    # Date and time
    date = Column(DateTime(timezone=True), nullable=False, index=True)
    availability_type = Column(String(20), nullable=False, default="full_day")  # full_day or partial_time
    start_time = Column(Time, nullable=True)  # Only for partial_time
    end_time = Column(Time, nullable=True)    # Only for partial_time
    
    # Reason/notes
    reason = Column(Text, nullable=True)
    
    # Metadata
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class AvailabilityException(Base):
    """Exceptions to weekly availability (one-time changes)"""
    __tablename__ = "availability_exceptions"

    id = Column(Integer, primary_key=True, index=True)
    lawyer_id = Column(Integer, ForeignKey("lawyers.id"), nullable=False, index=True)
    lawyer_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    weekly_availability_id = Column(Integer, ForeignKey("weekly_availability.id"), nullable=False)
    
    # Exception date
    exception_date = Column(DateTime(timezone=True), nullable=False, index=True)
    
    # Override details (null means cancelled for that day)
    override_start_time = Column(Time, nullable=True)
    override_end_time = Column(Time, nullable=True)
    override_max_bookings = Column(Integer, nullable=True)
    
    # Reason for exception
    reason = Column(Text, nullable=True)
    
    # Metadata
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    lawyer = relationship("Lawyer")
    weekly_availability = relationship("WeeklyAvailability")
