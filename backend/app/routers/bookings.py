from datetime import date, datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
import logging
from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from app.database import get_db
from app.models.booking import Booking
from app.modules.cases.models import Case
from app.routers.auth import get_current_user
from app.schemas.booking import (
    BookingCreate,
    BookingOut,
    BookingCancelOut,
    BookingSummaryOut,
    BookingSlotsByDateOut,
)
from app.models.user import User
from app.modules.audit_log.service import log_event
from app.modules.blackouts.models import BlackoutDay
from app.modules.lawyer_profiles.models import LawyerProfile
from app.models.branch import Branch
from app.models.service_package import ServicePackage
from app.modules.availability.service import get_available_slots
from app.models.lawyer import Lawyer
from app.modules.rbac.dependencies import require_privilege

router = APIRouter(prefix="/api/bookings", tags=["bookings"])
logger = logging.getLogger(__name__)


@router.post("", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
def create_booking(
    booking_in: BookingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_privilege("booking.create")),
):
    """Create a new booking. Only clients can create bookings."""
    if current_user.role != "client":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only clients can create bookings",
        )

    if booking_in.case_id is None:
        raise HTTPException(status_code=422, detail="case_id required")
    if booking_in.scheduled_at is None:
        raise HTTPException(status_code=422, detail="scheduled_at required")

    case = db.query(Case).filter(Case.id == booking_in.case_id).first()
    if not case or case.client_id != current_user.id:
        raise HTTPException(status_code=400, detail="Invalid case for this client")

    # Prevent bookings on blackout days for the lawyer
    if booking_in.scheduled_at:
        try:
            scheduled_date = booking_in.scheduled_at.date()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid scheduled_at value")

        blackout = (
            db.query(BlackoutDay)
            .filter(BlackoutDay.lawyer_id == booking_in.lawyer_id, BlackoutDay.date == scheduled_date)
            .first()
        )
        if blackout:
            raise HTTPException(status_code=400, detail="Lawyer unavailable on this date")

    if booking_in.branch_id is None:
        raise HTTPException(status_code=422, detail="branch_id required")
    if booking_in.service_package_id is None:
        raise HTTPException(status_code=422, detail="service_package_id required")

    branch = db.query(Branch).filter(Branch.id == booking_in.branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    branch_user_id = getattr(branch, "user_id", None)
    branch_lawyer_id = getattr(branch, "lawyer_id", None)
    if branch_user_id is not None and branch_user_id != booking_in.lawyer_id:
        raise HTTPException(status_code=403, detail="Branch does not belong to lawyer")
    if branch_lawyer_id is not None:
        # fallback for legacy schemas
        lawyer_row = db.query(Lawyer).filter(Lawyer.user_id == booking_in.lawyer_id).first()
        if lawyer_row is None:
            raise HTTPException(status_code=404, detail="Lawyer profile not found")
        if branch_lawyer_id != lawyer_row.id:
            raise HTTPException(status_code=403, detail="Branch does not belong to lawyer")

    pkg = db.query(ServicePackage).filter(ServicePackage.id == booking_in.service_package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Service package not found")
    lawyer_row = db.query(Lawyer).filter(Lawyer.user_id == booking_in.lawyer_id).first()
    if not lawyer_row:
        raise HTTPException(status_code=404, detail="Lawyer profile not found")
    if pkg.lawyer_id != lawyer_row.id:
        raise HTTPException(status_code=403, detail="Service package does not belong to lawyer")

    # Enforce sequential booking rule: only earliest available slot can be booked
    slot_days = get_available_slots(
        db,
        lawyer_user_id=booking_in.lawyer_id,
        branch_id=booking_in.branch_id,
        service_package_id=booking_in.service_package_id,
        start_date=scheduled_date,
        days=1,
    )
    allowed_starts = []
    for day in slot_days:
        for slot in day.get("slots", []):
            try:
                allowed_starts.append(datetime.fromisoformat(slot["start"]))
            except Exception:
                continue
    if not allowed_starts:
        raise HTTPException(status_code=400, detail="No available slot for selected time")
    scheduled_at = booking_in.scheduled_at
    matches = any(
        (s.astimezone(timezone.utc) == scheduled_at.astimezone(timezone.utc)) for s in allowed_starts
    )
    if not matches:
        raise HTTPException(status_code=400, detail="Selected time is not the next available slot")

    duration_minutes = int(pkg.duration or 0)
    if duration_minutes <= 0:
        raise HTTPException(status_code=400, detail="Service duration is invalid")
    ends_at = booking_in.scheduled_at + timedelta(minutes=duration_minutes)

    # Conflict check (pending + confirmed)
    conflict = (
        db.query(Booking)
        .filter(
            Booking.lawyer_id == booking_in.lawyer_id,
            Booking.branch_id == booking_in.branch_id,
            Booking.blocks_time.is_(True),
            Booking.scheduled_at.isnot(None),
            Booking.ends_at.isnot(None),
            Booking.scheduled_at < ends_at,
            Booking.ends_at > booking_in.scheduled_at,
        )
        .first()
    )
    if conflict:
        raise HTTPException(status_code=409, detail="Selected time overlaps an existing booking")

    booking = Booking(
        client_id=current_user.id,
        lawyer_id=booking_in.lawyer_id,
        branch_id=booking_in.branch_id,
        scheduled_at=booking_in.scheduled_at,
        ends_at=ends_at,
        note=booking_in.note,
        service_package_id=booking_in.service_package_id,
        case_id=booking_in.case_id,
        status="pending",
        blocks_time=True,
    )
    db.add(booking)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Selected time overlaps an existing booking")
    db.refresh(booking)
    # Diagnostics: confirm insert + log DB URL/schema and timestamps (sanitized).
    try:
        db_url = db.get_bind().engine.url.render_as_string(hide_password=True)
        schema = db.execute(text("SELECT current_schema()")).scalar_one_or_none()
        exists = db.query(Booking.id).filter(Booking.id == booking.id).count()
        logger.info(
            "Booking created id=%s exists=%s db=%s schema=%s scheduled_at=%s ends_at=%s",
            booking.id,
            exists,
            db_url,
            schema,
            booking.scheduled_at,
            booking.ends_at,
        )
    except Exception as exc:
        logger.warning("Booking insert diagnostic failed: %s", exc)
    log_event(
        db,
        user=current_user,
        action="BOOKING_CREATED",
        description=f"Booking {booking.id} created by client",
        meta={
            "booking_id": booking.id,
            "lawyer_id": booking.lawyer_id,
            "client_id": booking.client_id,
            "status_from": "new",
            "status_to": booking.status,
        },
    )
    return BookingOut.model_validate(booking)


@router.get("/available-slots", response_model=list[BookingSlotsByDateOut])
def list_available_slots(
    lawyer_user_id: int = Query(..., description="users.id for the lawyer"),
    branch_id: int = Query(..., description="Branch ID for the selected location"),
    service_package_id: int = Query(..., description="Service package ID to infer duration"),
    start_date: date = Query(default_factory=date.today),
    days: int = Query(14, ge=1, le=31),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Any authenticated user can view slots
    return get_available_slots(
        db,
        lawyer_user_id=lawyer_user_id,
        branch_id=branch_id,
        service_package_id=service_package_id,
        start_date=start_date,
        days=days,
    )


@router.get("/my", response_model=list[BookingOut])
def list_my_bookings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_privilege("booking.view")),
):
    """List bookings for the current user. Clients see their bookings, lawyers see bookings assigned to them."""
    if current_user.role == "client":
        bookings = (
            db.query(Booking)
            .filter(Booking.client_id == current_user.id)
            .order_by(Booking.created_at.desc())
            .all()
        )
    elif current_user.role == "lawyer":
        bookings = (
            db.query(Booking)
            .filter(Booking.lawyer_id == current_user.id)
            .order_by(Booking.created_at.desc())
            .all()
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only clients and lawyers can list bookings",
        )
    
    return [BookingOut.model_validate(b) for b in bookings]


@router.get("", response_model=list[BookingOut])
def list_bookings(
    case_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_privilege("booking.view")),
):
    if case_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="case_id is required")

    q = db.query(Booking).filter(Booking.case_id == case_id)

    if current_user.role == "admin":
        # Admins can view all bookings for the case.
        pass
    elif current_user.role == "client":
        q = q.filter(Booking.client_id == current_user.id)
    elif current_user.role == "lawyer":
        q = q.filter(Booking.lawyer_id == current_user.id)
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only clients and lawyers can view bookings by case",
        )

    bookings = q.order_by(Booking.created_at.desc()).all()
    return [BookingOut.model_validate(b) for b in bookings]


@router.get("/my/summary", response_model=list[BookingSummaryOut])
def list_my_bookings_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lawyer_user = aliased(User)
    profile = aliased(LawyerProfile)

    base_query = (
        db.query(
            Booking,
            lawyer_user.full_name,
            profile.specialization,
            profile.city,
            profile.district,
            Branch.name,
            Branch.city,
            ServicePackage.name,
            Case.title,
            Case.summary_public,
        )
        .join(lawyer_user, Booking.lawyer_id == lawyer_user.id)
        .outerjoin(profile, profile.user_id == lawyer_user.id)
        .outerjoin(Branch, Booking.branch_id == Branch.id)
        .outerjoin(ServicePackage, Booking.service_package_id == ServicePackage.id)
        .outerjoin(Case, Booking.case_id == Case.id)
    )

    if current_user.role == "client":
        base_query = base_query.filter(Booking.client_id == current_user.id)
    elif current_user.role == "lawyer":
        base_query = base_query.filter(Booking.lawyer_id == current_user.id)
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only clients and lawyers can list bookings",
        )

    rows = base_query.order_by(Booking.created_at.desc()).all()

    summaries = []
    for (
        booking,
        lawyer_name,
        specialization,
        lawyer_city,
        lawyer_district,
        branch_name,
        branch_city,
        service_name,
        case_title,
        case_summary,
    ) in rows:
        summaries.append(
            BookingSummaryOut(
                id=booking.id,
                client_id=booking.client_id,
                lawyer_id=booking.lawyer_id,
                branch_id=booking.branch_id,
                service_package_id=booking.service_package_id,
                case_id=booking.case_id,
                scheduled_at=booking.scheduled_at,
                note=booking.note,
                status=booking.status,
                created_at=booking.created_at,
                updated_at=booking.updated_at,
                lawyer_name=lawyer_name,
                lawyer_specialization=specialization,
                lawyer_city=lawyer_city,
                lawyer_district=lawyer_district,
                branch_name=branch_name,
                branch_city=branch_city,
                service_name=service_name,
                case_title=case_title,
                case_summary=case_summary,
            )
        )

    return summaries


@router.get("/{booking_id}", response_model=BookingOut)
def get_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get booking details. Allowed for client owner OR lawyer owner."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    # Check if user is the client owner or lawyer owner
    is_client_owner = booking.client_id == current_user.id
    is_lawyer_owner = booking.lawyer_id == current_user.id

    if not (is_client_owner or is_lawyer_owner):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this booking",
        )

    return BookingOut.model_validate(booking)


@router.patch("/{booking_id}/cancel", response_model=BookingCancelOut)
def cancel_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cancel a booking. Only the client owner can cancel."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    # Only client owner can cancel
    if booking.client_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the client who owns this booking can cancel it",
        )

    booking.status = "cancelled"
    booking.blocks_time = False
    db.commit()
    db.refresh(booking)
    log_event(
        db,
        user=current_user,
        action="BOOKING_CANCELLED",
        description=f"Booking {booking.id} cancelled by client",
        meta={
            "booking_id": booking.id,
            "client_id": booking.client_id,
            "lawyer_id": booking.lawyer_id,
        },
    )
    return BookingCancelOut.model_validate(booking)


@router.get("/lawyer/incoming", response_model=list[BookingOut])
def list_lawyer_incoming_bookings(
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_privilege("booking.view")),
):
    """List incoming booking requests for the current lawyer (status: pending).
    Only available for lawyers.
    """
    # Incoming list is lawyer-only: require a linked lawyer profile instead of role string.
    lawyer_row = db.query(Lawyer).filter(Lawyer.user_id == current_user.id).first()
    if not lawyer_row:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only lawyers can view incoming bookings",
        )

    statuses = None
    if status:
        normalized = status.strip().lower()
        if normalized in {"all", "*", "any"}:
            statuses = {"pending", "confirmed", "rejected", "cancelled"}
        elif "," in normalized:
            statuses = {s.strip().lower() for s in normalized.split(",") if s.strip()}
        else:
            statuses = {normalized}
    else:
        statuses = {"pending"}

    bookings = (
        db.query(Booking)
        .filter(
            Booking.lawyer_id == current_user.id,
            func.lower(Booking.status).in_(list(statuses)),
        )
        .order_by(Booking.created_at.desc())
        .all()
    )

    return [BookingOut.model_validate(b) for b in bookings]


@router.get("/incoming", response_model=list[BookingOut])
def list_incoming_bookings(
    status: str = "pending",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_privilege("booking.view")),
):
    """Alias for incoming bookings (lawyer only) with optional status filter."""
    # Incoming list is lawyer-only: require a linked lawyer profile instead of role string.
    lawyer_row = db.query(Lawyer).filter(Lawyer.user_id == current_user.id).first()
    if not lawyer_row:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only lawyers can view incoming bookings",
        )

    q = db.query(Booking).filter(Booking.lawyer_id == current_user.id)
    if status:
        normalized = status.strip().lower()
        if normalized in {"all", "*", "any"}:
            statuses = {"pending", "confirmed", "rejected", "cancelled"}
            q = q.filter(func.lower(Booking.status).in_(list(statuses)))
        elif "," in normalized:
            statuses = {s.strip().lower() for s in normalized.split(",") if s.strip()}
            q = q.filter(func.lower(Booking.status).in_(list(statuses)))
        else:
            q = q.filter(func.lower(Booking.status) == normalized)
    bookings = q.order_by(Booking.created_at.desc()).all()
    return [BookingOut.model_validate(b) for b in bookings]


@router.patch("/{booking_id}/confirm", response_model=BookingOut)
def confirm_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_privilege("booking.confirm")),
):
    """Confirm a booking request. Only the assigned lawyer can confirm pending bookings."""
    if current_user.role != "lawyer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only lawyers can confirm bookings",
        )

    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    # Check if user is the assigned lawyer
    if booking.lawyer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only confirm bookings assigned to you",
        )

    # Check if booking is pending
    if booking.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot confirm booking with status '{booking.status}'. Only pending bookings can be confirmed.",
        )

    status_from = booking.status
    booking.status = "confirmed"
    booking.blocks_time = True
    db.commit()
    db.refresh(booking)
    log_event(
        db,
        user=current_user,
        action="BOOKING_CONFIRMED",
        description=f"Booking {booking.id} confirmed by lawyer",
        meta={
            "booking_id": booking.id,
            "lawyer_id": booking.lawyer_id,
            "client_id": booking.client_id,
            "status_from": status_from,
            "status_to": booking.status,
        },
    )
    return BookingOut.model_validate(booking)


@router.patch("/{booking_id}/reject", response_model=BookingOut)
def reject_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = Depends(require_privilege("booking.reject")),
):
    """Reject a booking request. Only the assigned lawyer can reject pending bookings."""
    if current_user.role != "lawyer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only lawyers can reject bookings",
        )

    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    # Check if user is the assigned lawyer
    if booking.lawyer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only reject bookings assigned to you",
        )

    # Check if booking is pending
    if booking.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reject booking with status '{booking.status}'. Only pending bookings can be rejected.",
        )

    status_from = booking.status
    booking.status = "rejected"
    booking.blocks_time = False
    db.commit()
    db.refresh(booking)
    log_event(
        db,
        user=current_user,
        action="BOOKING_REJECTED",
        description=f"Booking {booking.id} rejected by lawyer",
        meta={
            "booking_id": booking.id,
            "lawyer_id": booking.lawyer_id,
            "client_id": booking.client_id,
            "status_from": status_from,
            "status_to": booking.status,
        },
    )
    return BookingOut.model_validate(booking)
