from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from datetime import time

from ..database import get_db
from ..models.availability_template import AvailabilityTemplate
from ..models.user import User, UserRole
from ..models.branch import Branch
from app.modules.availability.service import resolve_lawyer_user_id
from pydantic import BaseModel

router = APIRouter(prefix="/api/lawyer-availability", tags=["Lawyer Availability"])

# Schemas
class AvailabilityTemplateBase(BaseModel):
    day_of_week: int  # 0=Monday, 6=Sunday
    start_time: str  # "09:00 AM"
    end_time: str    # "05:00 PM"
    slot_minutes: int

class AvailabilityTemplateCreate(AvailabilityTemplateBase):
    pass

class AvailabilityTemplateResponse(AvailabilityTemplateBase):
    id: str
    lawyer_id: int
    lawyer_user_id: int
    is_active: bool
    created_at: str

    class Config:
        from_attributes = True

class BranchInfo(BaseModel):
    id: int
    name: str
    city: str
    district: str

    class Config:
        from_attributes = True

# Helper function to convert time string to time object
def parse_time_string(time_str: str) -> time:
    """Convert HH:MM AM/PM string to time object"""
    try:
        time_part = time_str.split()[0]
        period = time_str.split()[1]
        hours, minutes = map(int, time_part.split(':'))
        
        if period.upper() == 'PM' and hours != 12:
            hours += 12
        elif period.upper() == 'AM' and hours == 12:
            hours = 0
            
        return time(hour=hours, minute=minutes)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid time format. Use HH:MM AM/PM"
        )

# Helper function to convert time object to HH:MM AM/PM string
def format_time_to_string(time_obj: time) -> str:
    """Convert time object to HH:MM AM/PM string"""
    hours = time_obj.hour
    minutes = time_obj.minute
    period = "AM" if hours < 12 else "PM"
    hours_12 = hours % 12
    if hours_12 == 0:
        hours_12 = 12
    return f"{hours_12}:{minutes:02d} {period}"

# Helper function to convert day string to integer
def day_to_int(day_str: str) -> int:
    days = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6}
    return days.get(day_str.lower(), 0)

# Helper function to convert integer to day string
def int_to_day(day_int: int) -> str:
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    return days[day_int] if 0 <= day_int <= 6 else "Monday"

@router.get("/branches", response_model=List[BranchInfo])
def get_branches(db: Session = Depends(get_db)):
    """Get all branches"""
    branches = db.query(Branch).all()
    return branches

@router.get("/lawyer/{lawyer_id}")
def _resolve_target_user_id(db: Session, *, lawyer_user_id: Optional[int], lawyer_id: Optional[int]) -> Optional[int]:
    if lawyer_user_id is not None:
        return lawyer_user_id
    if lawyer_id is None:
        return None
    user = db.query(User).filter(User.id == lawyer_id, User.role == UserRole.lawyer).first()
    if user:
        return user.id
    return resolve_lawyer_user_id(db, lawyer_id)


def get_lawyer_availability(
    lawyer_id: int,
    lawyer_user_id: Optional[int] = Query(None, description="Preferred users.id (optional)"),
    db: Session = Depends(get_db),
):
    """Get all availability for a lawyer"""

    target_id = _resolve_target_user_id(db, lawyer_user_id=lawyer_user_id, lawyer_id=lawyer_id)
    if target_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lawyer not found"
        )

    lawyer_user = db.query(User).filter(User.id == target_id, User.role == UserRole.lawyer).first()
    if not lawyer_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lawyer not found"
        )
    
    # Get availability templates
    templates = db.query(AvailabilityTemplate).filter(
        AvailabilityTemplate.lawyer_id == target_id,
        AvailabilityTemplate.is_active == True
    ).all()
    
    # Convert to response format
    weekly_slots = []
    for template in templates:
        weekly_slots.append({
            "id": str(template.id),
            "day_of_week": int_to_day(template.day_of_week),
            "start_time": format_time_to_string(template.start_time),
            "end_time": format_time_to_string(template.end_time),
            "max_bookings": template.slot_minutes // 60,  # Convert minutes to hours as booking count
            "is_active": template.is_active
        })
    
    return {
        "weekly_slots": weekly_slots,
        "blackout_dates": [],
        "total_weekly_hours": sum(t.slot_minutes for t in templates) / 60,
        "total_daily_capacity": len(templates),
        "active_blackouts": 0
    }

@router.post("/weekly", response_model=AvailabilityTemplateResponse)
def create_weekly_availability(
    slot_data: AvailabilityTemplateCreate,
    lawyer_id: int = Query(..., description="Lawyer ID"),
    lawyer_user_id: Optional[int] = Query(None, description="Preferred users.id (optional)"),
    db: Session = Depends(get_db)
):
    """Create a new weekly availability template"""

    target_id = _resolve_target_user_id(db, lawyer_user_id=lawyer_user_id, lawyer_id=lawyer_id)
    if target_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lawyer not found"
        )

    lawyer_user = db.query(User).filter(User.id == target_id, User.role == UserRole.lawyer).first()
    if not lawyer_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lawyer not found"
        )
    
    # Parse times
    start_time = parse_time_string(slot_data.start_time)
    end_time = parse_time_string(slot_data.end_time)
    
    # Calculate slot minutes
    start_minutes = start_time.hour * 60 + start_time.minute
    end_minutes = end_time.hour * 60 + end_time.minute
    slot_minutes = end_minutes - start_minutes
    
    # Convert day string to integer
    day_int = day_to_int(int_to_day(slot_data.day_of_week))
    
    # Create template
    template = AvailabilityTemplate(
        lawyer_id=target_id,
        day_of_week=day_int,
        start_time=start_time,
        end_time=end_time,
        slot_minutes=slot_minutes
    )
    
    db.add(template)
    db.commit()
    db.refresh(template)
    
    return {
        "id": str(template.id),
        "lawyer_id": template.lawyer_id,
        "lawyer_user_id": template.lawyer_id,
        "day_of_week": template.day_of_week,
        "start_time": format_time_to_string(template.start_time),
        "end_time": format_time_to_string(template.end_time),
        "slot_minutes": template.slot_minutes,
        "is_active": template.is_active,
        "created_at": template.created_at.isoformat()
    }

@router.put("/weekly/{template_id}", response_model=AvailabilityTemplateResponse)
def update_weekly_availability(
    template_id: str,
    slot_data: AvailabilityTemplateCreate,
    db: Session = Depends(get_db)
):
    """Update an existing availability template"""
    
    import uuid
    try:
        template_uuid = uuid.UUID(template_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid template ID"
        )
    
    template = db.query(AvailabilityTemplate).filter(
        AvailabilityTemplate.id == template_uuid
    ).first()
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    # Parse times
    start_time = parse_time_string(slot_data.start_time)
    end_time = parse_time_string(slot_data.end_time)
    
    # Calculate slot minutes
    start_minutes = start_time.hour * 60 + start_time.minute
    end_minutes = end_time.hour * 60 + end_time.minute
    slot_minutes = end_minutes - start_minutes
    
    # Update template
    template.day_of_week = slot_data.day_of_week
    template.start_time = start_time
    template.end_time = end_time
    template.slot_minutes = slot_minutes
    
    db.commit()
    db.refresh(template)
    
    return {
        "id": str(template.id),
        "lawyer_id": template.lawyer_id,
        "lawyer_user_id": template.lawyer_id,
        "day_of_week": template.day_of_week,
        "start_time": format_time_to_string(template.start_time),
        "end_time": format_time_to_string(template.end_time),
        "slot_minutes": template.slot_minutes,
        "is_active": template.is_active,
        "created_at": template.created_at.isoformat()
    }

@router.delete("/weekly/{template_id}")
def delete_weekly_availability(template_id: str, db: Session = Depends(get_db)):
    """Delete an availability template"""
    
    import uuid
    try:
        template_uuid = uuid.UUID(template_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid template ID"
        )
    
    template = db.query(AvailabilityTemplate).filter(
        AvailabilityTemplate.id == template_uuid
    ).first()
    
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    db.delete(template)
    db.commit()
    
    return {"status": "deleted"}
