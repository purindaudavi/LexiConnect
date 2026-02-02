from datetime import date, datetime, time, timedelta, timezone
import logging
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.modules.availability.models import AvailabilityTemplate
from app.modules.availability.schemas import (
    AvailabilityTemplateCreate,
    AvailabilityTemplateUpdate,
)
from app.models.booking import Booking
from app.models.branch import Branch
from app.models.lawyer_availability import WeeklyAvailability
from app.models.lawyer import Lawyer
from app.models.service_package import ServicePackage
from app.models.user import User, UserRole
from app.modules.blackouts.models import BlackoutDay

logger = logging.getLogger(__name__)


def resolve_lawyer_user_id(db: Session, lawyer_id: int) -> int | None:
    if lawyer_id is None:
        return None
    lawyer = db.query(Lawyer).filter(Lawyer.id == lawyer_id).first()
    if not lawyer:
        return None
    if lawyer.user_id:
        return lawyer.user_id
    if not lawyer.email:
        return None
    user = db.query(User).filter(User.email == lawyer.email).first()
    return user.id if user else None


def _get_timezone(tz_name: str):
    try:
        return ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, ModuleNotFoundError, Exception):
        # Use a fixed offset for Asia/Colombo to avoid silent UTC shifts.
        logger.warning("Timezone '%s' not available; falling back to Asia/Colombo offset", tz_name)
        return timezone(timedelta(hours=5, minutes=30))


def _validate_time_range(start_time, end_time) -> None:
    if start_time >= end_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_time must be before end_time",
        )


def _validate_slot_minutes(slot_minutes: int) -> None:
    if slot_minutes < 5 or slot_minutes > 240:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="slot_minutes must be between 5 and 240",
        )


def _ensure_no_overlap(
    db: Session,
    *,
    lawyer_id: int,
    day_of_week: int,
    start_time,
    end_time,
    exclude_id=None,
) -> None:
    stmt = (
        select(AvailabilityTemplate.id)
        .where(
            AvailabilityTemplate.lawyer_id == lawyer_id,
            AvailabilityTemplate.day_of_week == day_of_week,
            AvailabilityTemplate.is_active.is_(True),
            AvailabilityTemplate.start_time < end_time,
            AvailabilityTemplate.end_time > start_time,
        )
        .limit(1)
    )

    if exclude_id is not None:
        stmt = stmt.where(AvailabilityTemplate.id != exclude_id)

    clash_id = db.execute(stmt).scalar_one_or_none()
    if clash_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Availability overlaps with an existing template",
        )


def create_availability_template(
    db: Session,
    *,
    lawyer_id: int,
    payload: AvailabilityTemplateCreate,
) -> AvailabilityTemplate:
    _validate_time_range(payload.start_time, payload.end_time)
    _validate_slot_minutes(payload.slot_minutes)

    if payload.is_active:
        _ensure_no_overlap(
            db,
            lawyer_id=lawyer_id,
            day_of_week=payload.day_of_week,
            start_time=payload.start_time,
            end_time=payload.end_time,
        )

    template = AvailabilityTemplate(
        lawyer_id=lawyer_id,
        day_of_week=payload.day_of_week,
        start_time=payload.start_time,
        end_time=payload.end_time,
        slot_minutes=payload.slot_minutes,
        is_active=payload.is_active,
    )

    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def list_my_availability(db: Session, *, lawyer_id: int) -> list[AvailabilityTemplate]:
    stmt = (
        select(AvailabilityTemplate)
        .where(AvailabilityTemplate.lawyer_id == lawyer_id)
        .order_by(AvailabilityTemplate.day_of_week.asc(), AvailabilityTemplate.start_time.asc())
    )
    return list(db.execute(stmt).scalars().all())


def update_availability_template(
    db: Session,
    *,
    lawyer_id: int,
    template_id,
    payload: AvailabilityTemplateUpdate,
) -> AvailabilityTemplate:
    template = db.get(AvailabilityTemplate, template_id)
    if template is None or template.lawyer_id != lawyer_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Availability not found")

    new_day_of_week = payload.day_of_week if payload.day_of_week is not None else template.day_of_week
    new_start_time = payload.start_time if payload.start_time is not None else template.start_time
    new_end_time = payload.end_time if payload.end_time is not None else template.end_time
    new_slot_minutes = payload.slot_minutes if payload.slot_minutes is not None else template.slot_minutes
    new_is_active = payload.is_active if payload.is_active is not None else template.is_active

    _validate_time_range(new_start_time, new_end_time)
    _validate_slot_minutes(new_slot_minutes)

    if new_is_active:
        _ensure_no_overlap(
            db,
            lawyer_id=lawyer_id,
            day_of_week=new_day_of_week,
            start_time=new_start_time,
            end_time=new_end_time,
            exclude_id=template.id,
        )

    template.day_of_week = new_day_of_week
    template.start_time = new_start_time
    template.end_time = new_end_time
    template.slot_minutes = new_slot_minutes
    template.is_active = new_is_active

    db.commit()
    db.refresh(template)
    return template


def delete_availability_template(db: Session, *, lawyer_id: int, template_id) -> None:
    template = db.get(AvailabilityTemplate, template_id)
    if template is None or template.lawyer_id != lawyer_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Availability not found")

    db.delete(template)
    db.commit()


def _time_to_minutes(value: time) -> int:
    return value.hour * 60 + value.minute


def _minutes_to_time_str(value: int) -> str:
    hours = (value // 60) % 24
    minutes = value % 60
    return f"{hours:02d}:{minutes:02d}"


ACTIVE_BOOKING_STATUSES = {"pending", "confirmed", "approved", "in_progress"}


def _build_busy_map(
    db: Session,
    *,
    lawyer_id: int,
    start_date: date,
    end_date: date,
    fallback_duration: int,
    branch_id: int | None = None,
) -> dict[str, list[tuple[int, int]]]:
    start_dt = datetime.combine(start_date, time.min)
    end_dt = datetime.combine(end_date, time.max)

    rows = (
        db.query(Booking, ServicePackage.duration)
        .outerjoin(ServicePackage, Booking.service_package_id == ServicePackage.id)
        .filter(
            Booking.lawyer_id == lawyer_id,
            Booking.scheduled_at.isnot(None),
            Booking.scheduled_at >= start_dt,
            Booking.scheduled_at <= end_dt,
            func.lower(Booking.status).in_(list(ACTIVE_BOOKING_STATUSES)),
        )
        .all()
    )

    busy_by_date: dict[str, list[tuple[int, int, int | None]]] = {}
    for booking, duration in rows:
        scheduled = booking.scheduled_at
        if scheduled is None:
            continue
        if branch_id is not None and booking.branch_id != branch_id:
            continue
        minutes = int(duration) if duration is not None else fallback_duration
        if minutes <= 0:
            minutes = fallback_duration

        start_min = scheduled.hour * 60 + scheduled.minute
        end_min = start_min + minutes
        key = scheduled.date().isoformat()
        busy_by_date.setdefault(key, []).append((start_min, end_min, booking.branch_id))

    return busy_by_date


def get_bookable_slots(
    db: Session,
    *,
    lawyer_id: int,
    date_from: date,
    days: int,
    duration_minutes: int,
    branch_id: int | None = None,
) -> list[dict]:
    if days < 1 or days > 31:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="days must be 1-31")
    if duration_minutes < 5 or duration_minutes > 240:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="duration_minutes must be between 5 and 240",
        )

    user_row = (
        db.query(User)
        .filter(User.id == lawyer_id, User.role == UserRole.lawyer)
        .first()
    )
    if not user_row:
        mapped_id = resolve_lawyer_user_id(db, lawyer_id)
        if mapped_id is not None:
            lawyer_id = mapped_id

    end_date = date_from + timedelta(days=days - 1)

    weekly_rows = (
        db.query(WeeklyAvailability)
        .filter(WeeklyAvailability.user_id == lawyer_id, WeeklyAvailability.is_active.is_(True))
        .all()
    )
    weekly_by_day: dict[str, list[WeeklyAvailability]] = {}
    for row in weekly_rows:
        if hasattr(row.day_of_week, "name"):
            key = row.day_of_week.name.upper()
        elif hasattr(row.day_of_week, "value"):
            key = str(row.day_of_week.value).upper()
        else:
            key = str(row.day_of_week).upper()
        weekly_by_day.setdefault(key, []).append(row)

    branch_query = db.query(Branch).filter(Branch.user_id == lawyer_id)
    if branch_id is not None:
        branch_query = branch_query.filter(Branch.id == branch_id)
    branch_map = {b.id: b for b in branch_query.all()}

    busy_by_date = _build_busy_map(
        db,
        lawyer_id=lawyer_id,
        start_date=date_from,
        end_date=end_date,
        fallback_duration=duration_minutes,
        branch_id=branch_id,
    )

    results: list[dict] = []
    current = date_from
    while current <= end_date:
        day_key = current.strftime("%A").upper()
        slots = []
        for row in weekly_by_day.get(day_key, []):
            if branch_id is not None and row.branch_id != branch_id:
                continue
            start_min = _time_to_minutes(row.start_time)
            end_min = _time_to_minutes(row.end_time)
            if end_min <= start_min:
                continue

            busy_list = busy_by_date.get(current.isoformat(), [])
            window_busy = [
                (busy_start, busy_end)
                for busy_start, busy_end, busy_branch_id in busy_list
                if (busy_branch_id == row.branch_id or (busy_branch_id is None and row.branch_id is None))
                and busy_start < end_min
                and busy_end > start_min
            ]

            next_start = max((end for _, end in window_busy), default=start_min)
            slot_end = next_start + duration_minutes
            if slot_end <= end_min:
                branch = branch_map.get(row.branch_id)
                slots.append(
                    {
                        "start_time": _minutes_to_time_str(next_start),
                        "end_time": _minutes_to_time_str(slot_end),
                        "branch_id": row.branch_id,
                        "branch_name": branch.name if branch else None,
                        "duration_minutes": duration_minutes,
                    }
                )

        slots.sort(key=lambda s: s["start_time"])
        results.append({"date": current.isoformat(), "slots": slots})
        current += timedelta(days=1)

    return results


def _subtract_intervals(
    available: list[tuple[datetime, datetime]],
    busy: list[tuple[datetime, datetime]],
) -> list[tuple[datetime, datetime]]:
    if not available:
        return []
    if not busy:
        return available

    busy_sorted = sorted(busy, key=lambda b: b[0])
    results: list[tuple[datetime, datetime]] = []

    for start, end in available:
        cursor = start
        for busy_start, busy_end in busy_sorted:
            if busy_end <= cursor:
                continue
            if busy_start >= end:
                break
            if busy_start > cursor:
                results.append((cursor, min(busy_start, end)))
            cursor = max(cursor, busy_end)
            if cursor >= end:
                break
        if cursor < end:
            results.append((cursor, end))

    return results


def _ceil_to_minutes(value: datetime, minutes: int) -> datetime:
    if minutes <= 0:
        return value
    ts = int(value.timestamp())
    step = minutes * 60
    remainder = ts % step
    if remainder == 0:
        return value
    return datetime.fromtimestamp(ts + (step - remainder), tz=value.tzinfo)


def _generate_sequential_slots_for_window(
    window_start: datetime,
    window_end: datetime,
    busy: list[tuple[datetime, datetime]],
    duration_minutes: int,
    slot_minutes: int,
) -> list[tuple[datetime, datetime]]:
    """
    Generate slots for a single window using a fixed grid and contiguous fill rule.
    Only slots starting at/after the contiguous end are allowed.
    """
    if duration_minutes <= 0 or window_end <= window_start or slot_minutes <= 0:
        return []

    window_busy = sorted(
        [
            (
                max(busy_start, window_start),
                min(busy_end, window_end),
            )
            for busy_start, busy_end in busy
            if busy_start < window_end and busy_end > window_start
        ],
        key=lambda item: item[0],
    )

    # Apply "no idle gaps" only when a booking starts at day_start.
    cursor = window_start
    anchored = any(busy_start <= window_start < busy_end for busy_start, busy_end in window_busy) or any(
        busy_start == window_start for busy_start, _ in window_busy
    )
    if anchored:
        for busy_start, busy_end in window_busy:
            if busy_start > cursor:
                break
            if busy_end > cursor:
                cursor = busy_end
        earliest_start = _ceil_to_minutes(cursor, slot_minutes)
    else:
        earliest_start = _ceil_to_minutes(window_start, slot_minutes)
    step = timedelta(minutes=slot_minutes)
    duration = timedelta(minutes=duration_minutes)

    slots: list[tuple[datetime, datetime]] = []
    current = earliest_start
    while current + duration <= window_end:
        candidate_end = current + duration
        overlaps = any(
            current < busy_end and candidate_end > busy_start
            for busy_start, busy_end in window_busy
        )
        if not overlaps:
            slots.append((current, candidate_end))
        current += step
    return slots


def get_available_slots(
    db: Session,
    *,
    lawyer_user_id: int,
    branch_id: int,
    service_package_id: int,
    start_date: date,
    days: int,
    tz_name: str = "Asia/Colombo",
) -> list[dict]:
    if days < 1 or days > 31:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="days must be 1-31")

    user_row = (
        db.query(User)
        .filter(User.id == lawyer_user_id, User.role == UserRole.lawyer)
        .first()
    )
    if not user_row:
        mapped_id = resolve_lawyer_user_id(db, lawyer_user_id)
        if mapped_id is not None:
            lawyer_user_id = mapped_id

    lawyer_row = db.query(Lawyer).filter(Lawyer.user_id == lawyer_user_id).first()
    if not lawyer_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lawyer profile not found")

    pkg = db.query(ServicePackage).filter(ServicePackage.id == service_package_id).first()
    if not pkg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service package not found")
    if pkg.lawyer_id != lawyer_row.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Service package does not belong to lawyer")

    duration_minutes = int(pkg.duration or 0)
    if duration_minutes <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Service package duration is invalid",
        )

    branch = db.query(Branch).filter(Branch.id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")

    branch_user_id = getattr(branch, "user_id", None)
    branch_lawyer_id = getattr(branch, "lawyer_id", None)
    if branch_user_id is not None and branch_user_id != lawyer_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Branch does not belong to lawyer")
    if branch_lawyer_id is not None and branch_lawyer_id != lawyer_row.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Branch does not belong to lawyer")

    tz = _get_timezone(tz_name)

    end_date = start_date + timedelta(days=days - 1)
    range_start_local = datetime.combine(start_date, time.min).replace(tzinfo=tz)
    range_end_local = datetime.combine(end_date + timedelta(days=1), time.min).replace(tzinfo=tz)
    range_start_utc = range_start_local.astimezone(timezone.utc)
    range_end_utc = range_end_local.astimezone(timezone.utc)

    blackout_dates = set(
        b.date
        for b in db.query(BlackoutDay)
        .filter(
            BlackoutDay.lawyer_id == lawyer_user_id,
            BlackoutDay.date >= start_date,
            BlackoutDay.date <= end_date,
        )
        .all()
    )

    weekly_query = db.query(WeeklyAvailability).filter(WeeklyAvailability.is_active.is_(True))
    if hasattr(WeeklyAvailability, "lawyer_id"):
        weekly_query = weekly_query.filter(WeeklyAvailability.lawyer_id == lawyer_row.id)
    else:
        weekly_query = weekly_query.filter(WeeklyAvailability.user_id == lawyer_user_id)
    weekly_query = weekly_query.filter(WeeklyAvailability.branch_id == branch_id)
    weekly_rows = weekly_query.all()

    weekly_by_day: dict[str, list[WeeklyAvailability]] = {}
    for row in weekly_rows:
        key = row.day_of_week.name.upper()
        weekly_by_day.setdefault(key, []).append(row)

    active_statuses = {"pending", "confirmed"}
    bookings_query = (
        db.query(Booking)
        .filter(
            Booking.lawyer_id == lawyer_user_id,
            Booking.scheduled_at.isnot(None),
            Booking.scheduled_at >= range_start_utc,
            Booking.scheduled_at < range_end_utc,
        )
    )
    if hasattr(Booking, "blocks_time"):
        bookings_query = bookings_query.filter(Booking.blocks_time.is_(True))
    else:
        bookings_query = bookings_query.filter(func.lower(Booking.status).in_(list(active_statuses)))
    bookings = bookings_query.all()

    booking_service_ids = {b.service_package_id for b in bookings if b.service_package_id}
    durations = {}
    if booking_service_ids:
        for row in (
            db.query(ServicePackage.id, ServicePackage.duration)
            .filter(ServicePackage.id.in_(list(booking_service_ids)))
            .all()
        ):
            durations[row[0]] = int(row[1] or 0)

    busy_by_date: dict[str, list[tuple[datetime, datetime]]] = {}
    for booking in bookings:
        if booking.branch_id is not None and booking.branch_id != branch_id:
            continue
        scheduled = booking.scheduled_at
        if scheduled is None:
            continue
        if booking.ends_at is not None:
            local_start = scheduled.astimezone(tz)
            local_end = booking.ends_at.astimezone(tz)
        else:
            duration = durations.get(booking.service_package_id) or duration_minutes
            if duration <= 0:
                duration = duration_minutes
            local_start = scheduled.astimezone(tz)
            local_end = local_start + timedelta(minutes=duration)
        day_key = local_start.date().isoformat()
        busy_by_date.setdefault(day_key, []).append((local_start, local_end))

    results: list[dict] = []
    current = start_date
    slot_minutes = 15  # stable grid to avoid cross-day shifts
    now_local = datetime.now(tz)
    while current <= end_date:
        day_key = current.strftime("%A").upper()
        slots: list[dict] = []
        if current not in blackout_dates:
            for row in weekly_by_day.get(day_key, []):
                start_dt = datetime.combine(current, row.start_time).replace(tzinfo=tz)
                end_dt = datetime.combine(current, row.end_time).replace(tzinfo=tz)
                if end_dt <= start_dt:
                    continue
                busy = busy_by_date.get(current.isoformat(), [])
                window_slots = _generate_sequential_slots_for_window(
                    start_dt,
                    end_dt,
                    busy,
                    duration_minutes,
                    slot_minutes,
                )
                for start_slot, end_slot in window_slots:
                    if current == now_local.date() and start_slot < now_local:
                        continue
                    slots.append(
                        {
                            "start": start_slot.isoformat(),
                            "end": end_slot.isoformat(),
                            "branch_id": branch_id,
                            "branch_name": branch.name,
                            "duration_minutes": duration_minutes,
                        }
                    )

        results.append({"date": current.isoformat(), "slots": slots})
        current += timedelta(days=1)

    return results
