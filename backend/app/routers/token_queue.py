import uuid
from datetime import date, datetime, timezone, timedelta
import logging

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session
from zoneinfo import ZoneInfo

from app.database import get_db
from app.models.user import User, UserRole
from app.models.booking import Booking
from app.models.branch import Branch
from app.models.lawyer_availability import WeeklyAvailability, WeekDay
from app.modules.queue.models import QueueEntry, QueueEntryStatus
from app.schemas.token_queue import TokenQueueCreate, TokenQueueOut, TokenQueueUpdate
from app.routers.auth import get_current_user
from app.modules.queue.service import generate_queue_from_bookings
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/token-queue", tags=["Token Queue"])
logger = logging.getLogger(__name__)

LOCAL_TZ = ZoneInfo("Asia/Colombo")


class SlotBookingOut(BaseModel):
    id: int
    scheduled_at: datetime
    status: str
    branch_id: int | None = None
    client_id: int
    client_name: str | None = None
    client_email: str | None = None
    client_phone: str | None = None
    reason: str | None = None
    time_local: str | None = None

    model_config = ConfigDict(from_attributes=True)


class SlotOut(BaseModel):
    id: int
    branch_id: int | None = None
    branch_name: str | None = None
    location: str | None = None
    start_time: str
    end_time: str
    max_bookings: int | None = None
    bookings: list[SlotBookingOut] = []

    model_config = ConfigDict(from_attributes=True)


class TokenQueueSlotsOut(BaseModel):
    date: date
    timezone: str
    start_utc: datetime
    end_utc: datetime
    statuses: list[str]
    slots: list[SlotOut]
    booking_count: int

    model_config = ConfigDict(from_attributes=True)


@router.post("", response_model=TokenQueueOut, status_code=status.HTTP_201_CREATED)
def create_token_queue_entry(payload: TokenQueueCreate, db: Session = Depends(get_db)):
    lawyer = db.get(User, payload.lawyer_id)
    if lawyer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lawyer user not found (id={payload.lawyer_id})",
        )

    client = db.get(User, payload.client_id)
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client user not found (id={payload.client_id})",
        )

    logger.info(
        "TokenQueue conflict check values date=%s lawyer_id=%s token_number=%s",
        payload.date,
        payload.lawyer_id,
        payload.token_number,
    )

    existing = (
        db.query(QueueEntry)
        .filter(
            QueueEntry.date == payload.date,
            QueueEntry.lawyer_id == payload.lawyer_id,
            QueueEntry.token_number == payload.token_number,
        )
        .first()
    )

    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Token queue entry already exists (id={existing.id})",
        )

    entry = QueueEntry(
        id=uuid.uuid4(),
        date=payload.date,
        token_number=payload.token_number,
        time=payload.time,
        lawyer_id=payload.lawyer_id,
        client_id=payload.client_id,
        branch_id=payload.branch_id,
        reason=payload.reason,
        notes=payload.notes,
        status=payload.status or QueueEntryStatus.pending,
    )

    db.add(entry)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        logger.exception(
            "TokenQueue commit failed (IntegrityError) date=%s lawyer_id=%s token_number=%s client_id=%s",
            payload.date,
            payload.lawyer_id,
            payload.token_number,
            payload.client_id,
        )

        existing_after_error = (
            db.query(QueueEntry)
            .filter(
                QueueEntry.date == payload.date,
                QueueEntry.lawyer_id == payload.lawyer_id,
                QueueEntry.token_number == payload.token_number,
            )
            .first()
        )

        logger.info(
            "TokenQueue commit IntegrityError; duplicate_recheck_found=%s existing_id=%s",
            existing_after_error is not None,
            str(existing_after_error.id) if existing_after_error is not None else None,
        )

        if existing_after_error is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Token queue entry already exists (id={existing_after_error.id})",
            )

        pgcode = getattr(getattr(e, "orig", None), "pgcode", None)
        orig_msg = str(getattr(e, "orig", e))

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Database integrity error (pgcode={pgcode}): {orig_msg}",
        )

    except SQLAlchemyError as e:
        db.rollback()
        logger.exception(
            "TokenQueue commit failed (SQLAlchemyError) date=%s lawyer_id=%s token_number=%s client_id=%s",
            payload.date,
            payload.lawyer_id,
            payload.token_number,
            payload.client_id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while creating token queue entry",
        )

    db.refresh(entry)
    data = TokenQueueOut.model_validate(entry)
    data.client_name = client.full_name if client else None
    return data


@router.get("", response_model=list[TokenQueueOut])
def list_token_queue_entries(
    date: date | None = Query(None),
    start: str | None = Query(None),
    end: str | None = Query(None),
    lawyer_id: int | None = Query(None),
    status: QueueEntryStatus | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List token queue entries. Lawyers see only their own queue."""
    def _parse_iso(dt_str: str) -> datetime:
        normalized = dt_str.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

    start_dt = _parse_iso(start) if start else None
    end_dt = _parse_iso(end) if end else None

    if start_dt and not end_dt:
        end_dt = start_dt + timedelta(days=1)
    if end_dt and not start_dt:
        start_dt = end_dt - timedelta(days=1)

    selected_date = date
    if selected_date is None and start_dt is not None:
        selected_date = start_dt.astimezone(timezone.utc).date()

    if selected_date is not None and not start_dt and not end_dt:
        start_dt = datetime.combine(selected_date, datetime.min.time(), tzinfo=timezone.utc)
        end_dt = start_dt + timedelta(days=1)

    # Backfill queue entries from bookings for the selected range/date.
    if start_dt and end_dt:
        target_lawyer_id = current_user.id if current_user.role == UserRole.lawyer else lawyer_id
        if target_lawyer_id:
            generate_queue_from_bookings(
                db,
                lawyer_id=target_lawyer_id,
                start_dt=start_dt,
                end_dt=end_dt,
                queue_date=selected_date or start_dt.astimezone(timezone.utc).date(),
            )

    stmt = sa.select(QueueEntry)

    # Lawyers can only see their own queue
    if current_user.role == UserRole.lawyer:
        stmt = stmt.where(QueueEntry.lawyer_id == current_user.id)

    if selected_date is not None:
        stmt = stmt.where(QueueEntry.date == selected_date)

    if lawyer_id is not None:
        # Admins can filter by lawyer_id
        if current_user.role == UserRole.admin:
            stmt = stmt.where(QueueEntry.lawyer_id == lawyer_id)

    if status is not None:
        stmt = stmt.where(QueueEntry.status == status)

    stmt = stmt.order_by(QueueEntry.date.desc(), QueueEntry.token_number.asc())

    entries = list(db.execute(stmt).scalars().all())
    
    # Build response with client names
    result = []
    for e in entries:
        client = db.get(User, e.client_id)
        data = TokenQueueOut.model_validate(e)
        data.client_name = client.full_name if client else None
        result.append(data)
    
    logger.info(
        "TokenQueue list date=%s start=%s end=%s status=%s included_statuses=%s count=%s",
        selected_date,
        start_dt,
        end_dt,
        status,
        "pending,confirmed",
        len(result),
    )

    return result


@router.get("/slots", response_model=TokenQueueSlotsOut)
def list_token_queue_slots(
    date: date = Query(...),
    status_filter: str | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.lawyer:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only lawyers can access this endpoint")

    # Interpret selected date in Asia/Colombo local time.
    day_start_local = datetime(
        date.year,
        date.month,
        date.day,
        0,
        0,
        0,
        tzinfo=LOCAL_TZ,
    )
    day_end_local = day_start_local + timedelta(days=1)
    start_utc = day_start_local.astimezone(timezone.utc)
    end_utc = day_end_local.astimezone(timezone.utc)

    statuses = ["confirmed", "pending"]
    if status_filter:
        statuses = [s.strip().lower() for s in status_filter.split(",") if s.strip()]
        if not statuses:
            statuses = ["confirmed", "pending"]

    # Slots for the selected weekday
    weekday_map = [
        WeekDay.MONDAY,
        WeekDay.TUESDAY,
        WeekDay.WEDNESDAY,
        WeekDay.THURSDAY,
        WeekDay.FRIDAY,
        WeekDay.SATURDAY,
        WeekDay.SUNDAY,
    ]
    weekday_enum = weekday_map[date.weekday()]

    slot_rows = (
        db.query(WeeklyAvailability)
        .filter(
            WeeklyAvailability.user_id == current_user.id,
            WeeklyAvailability.day_of_week == weekday_enum,
            WeeklyAvailability.is_active.is_(True),
        )
        .order_by(WeeklyAvailability.start_time.asc())
        .all()
    )

    branches = db.query(Branch).filter(Branch.user_id == current_user.id).all()
    branch_name_by_id = {b.id: b.name for b in branches}

    bookings = (
        db.query(Booking)
        .filter(
            Booking.lawyer_id == current_user.id,
            Booking.scheduled_at.is_not(None),
            Booking.scheduled_at >= start_utc,
            Booking.scheduled_at < end_utc,
            sa.func.lower(Booking.status).in_(statuses),
        )
        .order_by(Booking.scheduled_at.asc())
        .all()
    )

    booking_payloads: list[SlotBookingOut] = []
    for b in bookings:
        scheduled = b.scheduled_at
        if scheduled is None:
            continue
        if scheduled.tzinfo is None:
            scheduled = scheduled.replace(tzinfo=timezone.utc)
        scheduled_local = scheduled.astimezone(LOCAL_TZ)
        client = db.get(User, b.client_id)
        booking_payloads.append(
            SlotBookingOut(
                id=b.id,
                scheduled_at=scheduled,
                status=b.status or "pending",
                branch_id=b.branch_id,
                client_id=b.client_id,
                client_name=client.full_name if client else None,
                client_email=client.email if client else None,
                client_phone=client.phone if client else None,
                reason=b.note,
                time_local=scheduled_local.strftime("%H:%M"),
            )
        )

    def _slot_bounds(slot_row: WeeklyAvailability):
        slot_start_local = datetime.combine(date, slot_row.start_time, tzinfo=LOCAL_TZ)
        slot_end_local = datetime.combine(date, slot_row.end_time, tzinfo=LOCAL_TZ)
        if slot_end_local <= slot_start_local:
            slot_end_local = slot_end_local + timedelta(days=1)
        return slot_start_local.astimezone(timezone.utc), slot_end_local.astimezone(timezone.utc)

    slots: list[SlotOut] = []
    for row in slot_rows:
        slot_start_utc, slot_end_utc = _slot_bounds(row)
        matched = [
            b
            for b in booking_payloads
            if (b.branch_id == row.branch_id)
            and (b.scheduled_at >= slot_start_utc)
            and (b.scheduled_at < slot_end_utc)
        ]

        slots.append(
            SlotOut(
                id=row.id,
                branch_id=row.branch_id,
                branch_name=branch_name_by_id.get(row.branch_id),
                location=row.location,
                start_time=row.start_time.strftime("%H:%M"),
                end_time=row.end_time.strftime("%H:%M"),
                max_bookings=row.max_bookings,
                bookings=matched,
            )
        )

    logger.info(
        "TokenQueue slots date=%s start_utc=%s end_utc=%s bookings=%s slots=%s",
        date,
        start_utc,
        end_utc,
        len(booking_payloads),
        len(slots),
    )
    for slot in slots:
        logger.info(
            "TokenQueue slot id=%s range=%s-%s branch_id=%s bookings=%s",
            slot.id,
            slot.start_time,
            slot.end_time,
            slot.branch_id,
            len(slot.bookings),
        )

    return TokenQueueSlotsOut(
        date=date,
        timezone=str(LOCAL_TZ),
        start_utc=start_utc,
        end_utc=end_utc,
        statuses=statuses,
        slots=slots,
        booking_count=sum(len(s.bookings) for s in slots),
    )


@router.get("/{entry_id}", response_model=TokenQueueOut)
def get_token_queue_entry(
    entry_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    entry = db.get(QueueEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token queue entry not found")
    client = db.get(User, entry.client_id)
    data = TokenQueueOut.model_validate(entry)
    data.client_name = client.full_name if client else None
    return data


@router.patch("/{entry_id}", response_model=TokenQueueOut)
def update_token_queue_entry(
    entry_id: uuid.UUID,
    payload: TokenQueueUpdate,
    db: Session = Depends(get_db),
):
    entry = db.get(QueueEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token queue entry not found")

    previous_status = entry.status
    entry.status = payload.status

    # Auto-set timestamps based on status changes
    if payload.status == QueueEntryStatus.in_progress and previous_status != QueueEntryStatus.in_progress:
        entry.started_at = datetime.now(timezone.utc)
    
    if payload.status == QueueEntryStatus.completed and previous_status != QueueEntryStatus.completed:
        entry.completed_at = datetime.now(timezone.utc)

    if payload.notes is not None:
        entry.notes = payload.notes

    if payload.started_at is not None:
        entry.started_at = payload.started_at

    if payload.completed_at is not None:
        entry.completed_at = payload.completed_at

    db.commit()
    db.refresh(entry)
    client = db.get(User, entry.client_id)
    data = TokenQueueOut.model_validate(entry)
    data.client_name = client.full_name if client else None
    return data


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_token_queue_entry(
    entry_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    entry = db.get(QueueEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token queue entry not found")
    
    db.delete(entry)
    db.commit()
    return None
