from datetime import date, time, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.lawyer_availability import WeeklyAvailability, WeekDay
from app.modules.blackouts.models import BlackoutDay
from app.models.branch import Branch
from app.modules.availability.service import resolve_lawyer_user_id
from app.routers.auth import get_current_user

# ---------------------------------------------------------------------------
# Canonical tables for availability in this phase:
# - weekly_availability: source of truth for recurring weekly schedule rows
# - blackout_days: source of truth for full-day blackouts
#
# Other availability tables (availability_templates, availability_slots,
# availability_exceptions, blackout_dates) are reserved for future features
# (templating/partial blocks). Do not use them in the current flow.
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/lawyer-availability", tags=["Lawyer Availability"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class WeeklyBase(BaseModel):
    day_of_week: str = Field(..., description="mon..sun (case-insensitive)")
    start_time: time
    end_time: time
    branch_id: Optional[int] = None
    location: Optional[str] = None
    max_bookings: Optional[int] = None
    is_active: Optional[bool] = True

    @field_validator("day_of_week", mode="before")
    @classmethod
    def normalize_day(cls, v: str):
        if not isinstance(v, str):
            raise ValueError("day_of_week must be a string")
        cleaned = v.strip().upper()
        short_map = {
            "MON": "MONDAY",
            "TUE": "TUESDAY",
            "WED": "WEDNESDAY",
            "THU": "THURSDAY",
            "FRI": "FRIDAY",
            "SAT": "SATURDAY",
            "SUN": "SUNDAY",
        }
        if cleaned in short_map:
            cleaned = short_map[cleaned]
        return cleaned


class WeeklyCreate(WeeklyBase):
    pass


class WeeklyUpdate(BaseModel):
    day_of_week: Optional[str] = Field(None, description="MONDAY..SUNDAY")
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    branch_id: Optional[int] = None
    location: Optional[str] = None
    max_bookings: Optional[int] = None
    is_active: Optional[bool] = None

    @field_validator("day_of_week", mode="before")
    @classmethod
    def normalize_day(cls, v):
        if v is None:
            return v
        return WeeklyBase.normalize_day(v)


class WeeklyOut(WeeklyBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class BlackoutBase(BaseModel):
    date: date
    reason: Optional[str] = None


class BlackoutCreate(BlackoutBase):
    pass


class BlackoutOut(BlackoutBase):
    model_config = ConfigDict(from_attributes=True)

    id: str


class AvailabilityBundle(BaseModel):
    weekly: List[WeeklyOut]
    blackouts: List[BlackoutOut]
    branches: List[dict]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _require_lawyer(user: User):
    if user.role != UserRole.lawyer:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only lawyers can access this resource")


def _resolve_target_user_id(
    db: Session,
    *,
    lawyer_user_id: Optional[int],
    lawyer_id: Optional[int],
) -> Optional[int]:
    if lawyer_user_id is not None:
        return lawyer_user_id
    if lawyer_id is None:
        return None
    user = db.query(User).filter(User.id == lawyer_id, User.role == UserRole.lawyer).first()
    if user:
        return user.id
    return resolve_lawyer_user_id(db, lawyer_id)


def _to_weekday(day_str: str) -> WeekDay:
    DAY_TO_ENUM = {
        "MON": WeekDay.MONDAY,
        "MONDAY": WeekDay.MONDAY,
        "TUE": WeekDay.TUESDAY,
        "TUESDAY": WeekDay.TUESDAY,
        "WED": WeekDay.WEDNESDAY,
        "WEDNESDAY": WeekDay.WEDNESDAY,
        "THU": WeekDay.THURSDAY,
        "THURSDAY": WeekDay.THURSDAY,
        "FRI": WeekDay.FRIDAY,
        "FRIDAY": WeekDay.FRIDAY,
        "SAT": WeekDay.SATURDAY,
        "SATURDAY": WeekDay.SATURDAY,
        "SUN": WeekDay.SUNDAY,
        "SUNDAY": WeekDay.SUNDAY,
    }
    key = day_str.strip().upper()
    if key not in DAY_TO_ENUM:
        allowed = list(DAY_TO_ENUM.keys())
        raise HTTPException(
            status_code=422,
            detail=f"Invalid day_of_week '{day_str}'. Allowed values: {', '.join(sorted(set(allowed)))}",
        )
    return DAY_TO_ENUM[key]


def _branch_for_lawyer(db: Session, branch_id: Optional[int], user_id: int) -> Optional[Branch]:
    if branch_id is None:
        raise HTTPException(status_code=400, detail="branch_id is required")
    branch = db.query(Branch).filter(Branch.id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    if branch.user_id and branch.user_id != user_id:
        raise HTTPException(status_code=403, detail="Branch does not belong to this lawyer")
    return branch


def _derive_location(branch: Optional[Branch], provided_location: Optional[str]) -> str:
    """
    Use the provided location when present; otherwise build one from the branch
    name/address or fall back to an online placeholder.
    """
    if provided_location:
        cleaned = provided_location.strip()
        if cleaned:
            return cleaned

    if branch:
        parts = [branch.name, branch.address]
        combined = " - ".join([p for p in parts if p])
        return combined or "Online Consultation"

    return "Online Consultation"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.get("/me", response_model=AvailabilityBundle)
def get_my_availability(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_lawyer(current_user)

    weekly_rows = (
        db.query(WeeklyAvailability)
        .filter(WeeklyAvailability.user_id == current_user.id)
        .order_by(WeeklyAvailability.day_of_week, WeeklyAvailability.start_time)
        .all()
    )

    weekly = [
        WeeklyOut(
            id=row.id,
            day_of_week=row.day_of_week.name.upper(),
            start_time=row.start_time,
            end_time=row.end_time,
            branch_id=row.branch_id,
            location=row.location,
            max_bookings=row.max_bookings,
            is_active=row.is_active,
        )
        for row in weekly_rows
    ]

    blackout_rows = (
        db.query(BlackoutDay)
        .filter(BlackoutDay.lawyer_id == current_user.id)
        .order_by(BlackoutDay.date.desc())
        .all()
    )
    blackouts = [
        BlackoutOut(id=str(b.id), date=b.date, reason=b.reason) for b in blackout_rows
    ]

    branches = db.query(Branch).filter(Branch.user_id == current_user.id).all()
    branch_out = [
        {"id": b.id, "name": b.name, "district": b.district, "city": b.city} for b in branches
    ]

    return AvailabilityBundle(weekly=weekly, blackouts=blackouts, branches=branch_out)


@router.get("/weekly", response_model=List[WeeklyOut])
def list_weekly(
    lawyer_id: Optional[int] = Query(None, description="Compatibility param (optional)"),
    lawyer_user_id: Optional[int] = Query(None, description="Preferred users.id (optional)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_lawyer(current_user)
    target_id = _resolve_target_user_id(db, lawyer_user_id=lawyer_user_id, lawyer_id=lawyer_id) or current_user.id
    if target_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot view another lawyer's availability")

    weekly_rows = (
        db.query(WeeklyAvailability)
        .filter(WeeklyAvailability.user_id == target_id)
        .order_by(WeeklyAvailability.day_of_week, WeeklyAvailability.start_time)
        .all()
    )
    return [
        WeeklyOut(
            id=row.id,
            day_of_week=row.day_of_week.name.upper(),
            start_time=row.start_time,
            end_time=row.end_time,
            branch_id=row.branch_id,
            location=row.location,
            max_bookings=row.max_bookings,
            is_active=row.is_active,
        )
        for row in weekly_rows
    ]


@router.get("/branches", response_model=List[dict])
def list_branches(
    lawyer_id: Optional[int] = Query(None, description="Compatibility param (optional)"),
    lawyer_user_id: Optional[int] = Query(None, description="Preferred users.id (optional)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_lawyer(current_user)
    target_id = _resolve_target_user_id(db, lawyer_user_id=lawyer_user_id, lawyer_id=lawyer_id) or current_user.id
    if target_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot view another lawyer's branches")
    branches = db.query(Branch).filter(Branch.user_id == target_id).all()
    return [{"id": b.id, "name": b.name, "district": b.district, "city": b.city} for b in branches]


@router.get("/blackouts", response_model=List[BlackoutOut])
def list_blackouts(
    lawyer_id: Optional[int] = Query(None, description="Compatibility param (optional)"),
    lawyer_user_id: Optional[int] = Query(None, description="Preferred users.id (optional)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_lawyer(current_user)
    # BlackoutDay FK points to users.id
    target_id = _resolve_target_user_id(db, lawyer_user_id=lawyer_user_id, lawyer_id=lawyer_id) or current_user.id
    if target_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot view another lawyer's blackouts")

    blackout_rows = (
        db.query(BlackoutDay)
        .filter(BlackoutDay.lawyer_id == target_id)
        .order_by(BlackoutDay.date.desc())
        .all()
    )
    return [BlackoutOut(id=str(b.id), date=b.date, reason=b.reason) for b in blackout_rows]


@router.post("/weekly", response_model=WeeklyOut, status_code=status.HTTP_201_CREATED)
def create_weekly_slot(
    payload: WeeklyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create weekly availability for the authenticated lawyer only.
    Ignores any client-supplied lawyer_id and uses the JWT user instead.
    """
    _require_lawyer(current_user)
    target_id = current_user.id

    print("[availability] create_weekly_slot payload", payload.model_dump())

    if payload.start_time >= payload.end_time:
        raise HTTPException(status_code=400, detail="start_time must be before end_time")

    try:
        branch = _branch_for_lawyer(db, payload.branch_id, target_id)
        location_value = _derive_location(branch, payload.location)
        weekday = _to_weekday(payload.day_of_week)

        normalized_payload = {
            "lawyer_id": target_id,
            "branch_id": payload.branch_id,
            "day_of_week": weekday.name,
            "start_time": payload.start_time.isoformat(),
            "end_time": payload.end_time.isoformat(),
            "max_bookings": payload.max_bookings or 1,
            "is_active": payload.is_active if payload.is_active is not None else True,
        }
        print("[availability] normalized payload", normalized_payload)

        existing = (
            db.query(WeeklyAvailability)
            .filter(
                WeeklyAvailability.user_id == target_id,
                WeeklyAvailability.branch_id == payload.branch_id,
                WeeklyAvailability.day_of_week == weekday,
                WeeklyAvailability.start_time == payload.start_time,
                WeeklyAvailability.end_time == payload.end_time,
            )
            .first()
        )

        if existing:
            raise HTTPException(
                status_code=409,
                detail="Availability already exists for this day/time/branch",
            )

        entry = WeeklyAvailability(
            user_id=target_id,
            branch_id=payload.branch_id,
            location=location_value,
            day_of_week=weekday,
            start_time=payload.start_time,
            end_time=payload.end_time,
            max_bookings=payload.max_bookings or 1,
            is_active=payload.is_active if payload.is_active is not None else True,
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        print(f"[availability] inserted weekly row id={entry.id}")

        return WeeklyOut(
            id=entry.id,
            day_of_week=entry.day_of_week.name.upper(),
            start_time=entry.start_time,
            end_time=entry.end_time,
            branch_id=entry.branch_id,
            location=entry.location,
            max_bookings=entry.max_bookings,
            is_active=entry.is_active,
        )
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        print("[availability] create_weekly_slot error", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.patch("/weekly/{entry_id}", response_model=WeeklyOut)
def update_weekly_slot(
    entry_id: int,
    payload: WeeklyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_lawyer(current_user)
    entry = (
        db.query(WeeklyAvailability)
        .filter(WeeklyAvailability.id == entry_id, WeeklyAvailability.user_id == current_user.id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Weekly availability not found")

    updates = payload.model_dump(exclude_unset=True)
    print("[availability] update_weekly_slot payload", {"entry_id": entry_id, **updates})
    provided_location = updates.pop("location", None)
    if provided_location is not None:
        provided_location = provided_location.strip() or None

    if "day_of_week" in updates:
        updates["day_of_week"] = _to_weekday(updates["day_of_week"])

    target_branch_id = updates.get("branch_id", entry.branch_id)
    branch = _branch_for_lawyer(db, target_branch_id, current_user.id)

    start_time = updates.get("start_time", entry.start_time)
    end_time = updates.get("end_time", entry.end_time)
    if start_time and end_time and start_time >= end_time:
        raise HTTPException(status_code=400, detail="start_time must be before end_time")

    if provided_location is not None or "branch_id" in updates:
        updates["location"] = _derive_location(branch, provided_location)

    for field, value in updates.items():
        setattr(entry, field, value)

    db.commit()
    db.refresh(entry)
    return WeeklyOut(
        id=entry.id,
        day_of_week=entry.day_of_week.name.upper(),
        start_time=entry.start_time,
        end_time=entry.end_time,
        branch_id=entry.branch_id,
        location=entry.location,
        max_bookings=entry.max_bookings,
        is_active=entry.is_active,
    )


@router.delete("/weekly/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_weekly_slot(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_lawyer(current_user)
    entry = (
        db.query(WeeklyAvailability)
        .filter(WeeklyAvailability.id == entry_id, WeeklyAvailability.user_id == current_user.id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Weekly availability not found")

    db.delete(entry)
    db.commit()
    return None


@router.post("/blackouts", response_model=BlackoutOut, status_code=status.HTTP_201_CREATED)
def create_blackout(
    payload: BlackoutCreate,
    lawyer_id: Optional[int] = Query(None, description="Compatibility param (optional)"),
    lawyer_user_id: Optional[int] = Query(None, description="Preferred users.id (optional)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_lawyer(current_user)
    target_id = _resolve_target_user_id(db, lawyer_user_id=lawyer_user_id, lawyer_id=lawyer_id) or current_user.id
    if target_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot create blackout for another lawyer")

    # prevent duplicate date per lawyer
    existing = (
        db.query(BlackoutDay)
        .filter(BlackoutDay.lawyer_id == target_id, BlackoutDay.date == payload.date)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Blackout for this date already exists")

    entry = BlackoutDay(
        lawyer_id=target_id,
        date=payload.date,
        reason=payload.reason,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return BlackoutOut(id=str(entry.id), date=entry.date, reason=entry.reason)


@router.delete("/blackouts/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_blackout(
    entry_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_lawyer(current_user)
    entry = (
        db.query(BlackoutDay)
        .filter(BlackoutDay.id == entry_id, BlackoutDay.lawyer_id == current_user.id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Blackout not found")

    db.delete(entry)
    db.commit()
    return None


# Compatibility endpoints (legacy naming)
@router.get("/blackout", response_model=List[BlackoutOut])
def list_blackouts_legacy(
    lawyer_id: Optional[int] = Query(None, description="Compatibility param (optional)"),
    lawyer_user_id: Optional[int] = Query(None, description="Preferred users.id (optional)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_blackouts(lawyer_id, lawyer_user_id, db, current_user)


@router.post("/blackout", response_model=BlackoutOut, status_code=status.HTTP_201_CREATED)
def create_blackout_legacy(
    payload: BlackoutCreate,
    lawyer_id: Optional[int] = Query(None, description="Compatibility param (optional)"),
    lawyer_user_id: Optional[int] = Query(None, description="Preferred users.id (optional)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_blackout(payload, lawyer_id, lawyer_user_id, db, current_user)


@router.delete("/blackout/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_blackout_legacy(
    entry_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return delete_blackout(entry_id, db, current_user)


@router.get("/slots")
def preview_slots(
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date: str = Query(..., description="YYYY-MM-DD"),
    lawyer_id: Optional[int] = Query(None, description="Compatibility param (optional)"),
    lawyer_user_id: Optional[int] = Query(None, description="Preferred users.id (optional)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # ✅ allow both lawyer + client, but apply rules

    try:
        start = date.fromisoformat(from_date)
        end = date.fromisoformat(to_date)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid date format, expected YYYY-MM-DD")

    if end < start:
        raise HTTPException(status_code=422, detail="to_date must be on or after from_date")

    # Determine target lawyer
    if current_user.role == UserRole.lawyer:
        target_lawyer_id = _resolve_target_user_id(db, lawyer_user_id=lawyer_user_id, lawyer_id=lawyer_id) or current_user.id
        if target_lawyer_id != current_user.id:
            raise HTTPException(status_code=403, detail="Cannot view another lawyer's slots")
    else:
        target_lawyer_id = _resolve_target_user_id(db, lawyer_user_id=lawyer_user_id, lawyer_id=lawyer_id)
        if target_lawyer_id is None:
            raise HTTPException(status_code=422, detail="lawyer_id is required")
        target_user = (
            db.query(User)
            .filter(User.id == target_lawyer_id, User.role == UserRole.lawyer)
            .first()
        )
        if not target_user:
            raise HTTPException(status_code=404, detail="Lawyer not found")

    # weekly availability uses user_id (users table id)
    weekly_rows = (
        db.query(WeeklyAvailability)
        .filter(WeeklyAvailability.user_id == target_lawyer_id, WeeklyAvailability.is_active.is_(True))
        .all()
    )

    weekly_by_day = {}
    for row in weekly_rows:
        key = row.day_of_week.name.upper()
        weekly_by_day.setdefault(key, []).append(row)

    branch_map = {b.id: b for b in db.query(Branch).filter(Branch.user_id == target_lawyer_id).all()}

    # ✅ optional: ignore blackouts for now (per your message)
    blackout_dates = set()

    slots = []
    current = start
    while current <= end:
        day_key = current.strftime("%A").upper()
        is_blackout = current in blackout_dates
        for row in weekly_by_day.get(day_key, []):
            branch = branch_map.get(row.branch_id)
            slots.append(
                {
                    "date": current.isoformat(),
                    "start_time": row.start_time,
                    "end_time": row.end_time,
                    "branch_id": row.branch_id,
                    "branch_name": branch.name if branch else None,
                    "location": row.location or _derive_location(branch, None),
                    "is_blackout": is_blackout,
                }
            )
        current += timedelta(days=1)

    return slots
