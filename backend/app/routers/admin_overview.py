from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.booking import Booking
from app.models.kyc_submission import KYCSubmission
from app.models.user import User, UserRole
from app.modules.audit_log.models import AuditLog
from app.modules.auth_log.models import AuthLog
from app.modules.lawyer_profiles.models import LawyerProfile
from app.routers.auth import get_current_user
from app.schemas.admin_overview import AdminOverviewResponse, LawyerOverview, RecentBooking

router = APIRouter(prefix="/api/admin", tags=["Admin Overview"])


def _require_admin(current_user: User):
    role = getattr(current_user, "role", None)
    if role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin only")


@router.get("/overview", response_model=AdminOverviewResponse)
def admin_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    total_users = db.query(User).count()
    total_lawyers = db.query(User).filter(User.role == UserRole.lawyer).count()
    total_bookings = db.query(Booking).count()

    pending_kyc = db.query(KYCSubmission).filter(KYCSubmission.status == "pending").count()
    verified_lawyers = db.query(KYCSubmission).filter(KYCSubmission.status == "approved").count()

    recent_booking_rows = (
        db.query(Booking, User)
        .join(User, Booking.client_id == User.id)
        .order_by(Booking.created_at.desc())
        .limit(5)
        .all()
    )

    recent_bookings = [
        RecentBooking(
            id=booking.id,
            client_name=client.full_name,
            status=booking.status,
            scheduled_at=booking.scheduled_at,
            created_at=booking.created_at,
        )
        for booking, client in recent_booking_rows
    ]

    # preload profiles
    profiles = db.query(LawyerProfile).all()
    profile_map = {p.user_id: p for p in profiles}

    # latest kyc per lawyer (assumes lawyer_id aligns to user_id)
    latest_kyc_map = {}
    for sub in db.query(KYCSubmission).order_by(KYCSubmission.submitted_at.desc()).all():
        if sub.lawyer_id not in latest_kyc_map:
            latest_kyc_map[sub.lawyer_id] = sub

    lawyers = []
    lawyer_users = db.query(User).filter(User.role == UserRole.lawyer).all()
    for user in lawyer_users:
        profile = profile_map.get(user.id)
        kyc = latest_kyc_map.get(user.id)

        specialization = profile.specialization if profile and profile.specialization else "General"
        kyc_status = kyc.status if kyc else "not_submitted"
        is_verified = kyc_status == "approved"

        lawyers.append(
            LawyerOverview(
                user_id=user.id,
                full_name=user.full_name,
                specialization=specialization,
                kyc_status=kyc_status,
                is_verified=is_verified,
            )
        )

    return AdminOverviewResponse(
        total_users=total_users,
        total_lawyers=total_lawyers,
        total_bookings=total_bookings,
        pending_kyc=pending_kyc,
        verified_lawyers=verified_lawyers,
        recent_bookings=recent_bookings,
        lawyers=lawyers,
    )


@router.get("/metrics/auth-logins-per-minute")
def auth_logins_per_minute(
    minutes: int = Query(60, ge=5, le=240),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    now_utc = datetime.now(timezone.utc)
    minutes = max(5, min(240, minutes))
    cutoff = now_utc - timedelta(minutes=minutes)

    rows = (
        db.query(
            func.date_trunc("minute", AuthLog.occurred_at).label("minute"),
            func.count().label("count"),
        )
        .filter(AuthLog.occurred_at >= cutoff, AuthLog.event_type == "LOGIN")
        .group_by("minute")
        .order_by("minute")
        .all()
    )

    counts = {}
    for row in rows:
        minute = row.minute
        if minute is None:
            continue
        if minute.tzinfo is None:
            minute = minute.replace(tzinfo=timezone.utc)
        counts[minute] = int(row.count or 0)

    start = cutoff.replace(second=0, microsecond=0)
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    end = now_utc.replace(second=0, microsecond=0)

    series = []
    cursor = start
    while cursor <= end:
        count = counts.get(cursor, 0)
        minute_iso = cursor.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        series.append({"minute": minute_iso, "count": count})
        cursor = cursor + timedelta(minutes=1)

    return series


@router.get("/metrics/audit-top-actions")
def audit_top_actions(
    days: int = Query(7, ge=1, le=90),
    limit: int = Query(8, ge=3, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    days = max(1, min(90, days))
    limit = max(3, min(20, limit))
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    rows = (
        db.query(AuditLog.action, func.count().label("count"))
        .filter(AuditLog.created_at >= cutoff)
        .group_by(AuditLog.action)
        .order_by(func.count().desc())
        .limit(limit)
        .all()
    )

    return [{"action": r.action, "count": int(r.count or 0)} for r in rows]
