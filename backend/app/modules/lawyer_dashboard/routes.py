from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db

# ✅ Change this import to your actual "current user" dependency
# examples you might already have:
# from app.core.security import get_current_user
# from app.core.auth import get_current_user
from app.routers.auth import get_current_user

# ✅ Change these model imports to your actual model locations
# (Search in backend/app/modules for these)
from app.models.user import User
from app.models.lawyer_kyc import LawyerKYC
from app.models.booking import Booking
from app.modules.queue.models import QueueEntry, QueueEntryStatus
from app.modules.cases.models import CaseRequest
from app.modules.lawyer_profiles.models import LawyerProfile

from pydantic import BaseModel
from typing import Optional


router = APIRouter(prefix="/lawyer", tags=["Lawyer Dashboard"])


# ---------- Schemas ----------
class DashboardSummaryOut(BaseModel):
    pendingRequests: int
    incomingBookings: int
    tokenQueueToday: int
    kycStatus: str


class LawyerProfileOut(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    district: Optional[str] = None
    specialization: Optional[str] = None
    experienceYears: Optional[int] = None
    languages: Optional[str] = None
    avatarUrl: Optional[str] = None
    bio: Optional[str] = None


# ---------- Helpers ----------
def _require_lawyer_user(user: User):
    role = (getattr(user, "role", "") or "").lower()
    if role != "lawyer":
        raise HTTPException(status_code=403, detail="Lawyer access required")


# ---------- Endpoints ----------
@router.get("/dashboard/summary", response_model=DashboardSummaryOut)
def get_lawyer_dashboard_summary(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_lawyer_user(user)

    lawyer_id = user.id

    # 1) Pending Case Access Requests
    pending_requests = (
        db.query(func.count(CaseRequest.id))
        .filter(CaseRequest.lawyer_id == lawyer_id)
        .filter(func.lower(CaseRequest.status) == "pending")
        .scalar()
        or 0
    )

    # 2) Incoming Bookings (pending/requested)
    incoming_bookings = (
        db.query(func.count(Booking.id))
        .filter(Booking.lawyer_id == lawyer_id)
        .filter(func.lower(Booking.status).in_(["pending", "requested"]))
        .scalar()
        or 0
    )

    # 3) Token Queue Today
    today = date.today()
    token_queue_today = (
        db.query(func.count(QueueEntry.id))
        .filter(QueueEntry.lawyer_id == lawyer_id)
        .filter(QueueEntry.date == today)
        .filter(QueueEntry.status.in_([QueueEntryStatus.waiting]))
        .scalar()
        or 0
    )

    # 4) KYC Status
    kyc = (
        db.query(LawyerKYC)
        .filter(LawyerKYC.user_id == lawyer_id)
        .order_by(LawyerKYC.id.desc())
        .first()
    )
    kyc_value = getattr(kyc, "status", None) or "not_submitted"
    kyc_status = (getattr(kyc_value, "value", kyc_value) or "not_submitted").lower()

    return DashboardSummaryOut(
        pendingRequests=pending_requests,
        incomingBookings=incoming_bookings,
        tokenQueueToday=token_queue_today,
        kycStatus=kyc_status,
    )


@router.get("/profile/me", response_model=LawyerProfileOut)
def get_my_lawyer_profile(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_lawyer_user(user)

    profile = db.query(LawyerProfile).filter(LawyerProfile.user_id == user.id).first()

    # ✅ Map fields based on your Lawyer model
    return LawyerProfileOut(
        name=getattr(user, "full_name", None) or "Lawyer",
        email=getattr(user, "email", "") or "",
        phone=getattr(user, "phone", None),
        district=getattr(profile, "district", None),
        specialization=getattr(profile, "specialization", None),
        experienceYears=getattr(profile, "years_of_experience", None),
        languages=getattr(profile, "languages", None),
        avatarUrl=None,
        bio=getattr(profile, "bio", None),
    )
