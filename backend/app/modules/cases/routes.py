from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import UserRole, User
from app.modules.lawyer_profiles.models import LawyerProfile
from app.models.specialization import Specialization
from app.routers.auth import get_current_user
from .models import Case, CaseRequest
from .schemas import (
    CaseCreate,
    CaseOut,
    CaseRequestCreate,
    CaseRequestOut,
    LawyerCaseRequestOut,
    LawyerSummaryOut,
)

router = APIRouter(prefix="/cases", tags=["Cases"])


def _is_role(user: User, role: str) -> bool:
    value = getattr(user, "role", None)
    if isinstance(value, UserRole):
        value = value.value
    return str(value or "").lower() == role


def _ensure_client(user: User):
    if not _is_role(user, "client"):
        raise HTTPException(status_code=403, detail="Clients only")


def _ensure_lawyer(user: User):
    if not _is_role(user, "lawyer"):
        raise HTTPException(status_code=403, detail="Lawyers only")


def _get_case_or_404(db: Session, case_id: int) -> Case:
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


def _ensure_case_owner(user: User, case: Case):
    if case.client_id != user.id:
        raise HTTPException(status_code=403, detail="Not allowed")


class RequestStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(approved|rejected)$")


@router.post("", response_model=CaseOut, status_code=status.HTTP_201_CREATED)
def create_case(
    payload: CaseCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _ensure_client(current_user)
    specialization = (
        db.query(Specialization)
        .filter(Specialization.id == payload.specialization_id)
        .first()
    )
    if not specialization:
        raise HTTPException(status_code=400, detail="Specialization not found")
    new_case = Case(
        client_id=current_user.id,
        title=payload.title,
        category=specialization.name,
        specialization_id=specialization.id,
        district=payload.district,
        summary_public=payload.summary_public,
        summary_private=payload.summary_private,
        status="open",
    )
    db.add(new_case)
    db.commit()
    db.refresh(new_case)
    return new_case


@router.get("/my", response_model=List[CaseOut])
def list_my_cases(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _ensure_client(current_user)
    cases = (
        db.query(Case)
        .filter(Case.client_id == current_user.id)
        .order_by(Case.created_at.desc())
        .all()
    )
    return cases


@router.get("/feed", response_model=List[CaseOut])
def list_open_cases(
    district: Optional[str] = Query(None),
    specialization_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _ensure_lawyer(current_user)
    q = db.query(Case).filter(Case.status == "open")
    if district:
        q = q.filter(Case.district.ilike(f"%{district}%"))
    if specialization_id:
        q = q.filter(Case.specialization_id == specialization_id)
    return q.order_by(Case.created_at.desc()).all()


@router.post(
    "/{case_id}/requests",
    response_model=CaseRequestOut,
    status_code=status.HTTP_201_CREATED,
)
def create_case_request(
    case_id: int,
    payload: CaseRequestCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _ensure_lawyer(current_user)
    case = _get_case_or_404(db, case_id)
    if case.status != "open":
        raise HTTPException(status_code=400, detail="Case is not open for requests")

    existing = (
        db.query(CaseRequest)
        .filter(CaseRequest.case_id == case_id, CaseRequest.lawyer_id == current_user.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Request already submitted for this case")

    request = CaseRequest(
        case_id=case_id,
        lawyer_id=current_user.id,
        message=payload.message,
        status="pending",
    )
    db.add(request)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Request already exists")
    db.refresh(request)
    return request


@router.get("/{case_id}/requests", response_model=List[CaseRequestOut])
def list_case_requests(
    case_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    case = _get_case_or_404(db, case_id)
    _ensure_client(current_user)
    _ensure_case_owner(current_user, case)
    rows = (
        db.query(CaseRequest, User, LawyerProfile)
        .join(User, User.id == CaseRequest.lawyer_id)
        .outerjoin(LawyerProfile, LawyerProfile.user_id == User.id)
        .filter(CaseRequest.case_id == case_id)
        .order_by(CaseRequest.created_at.desc())
        .all()
    )

    out: List[CaseRequestOut] = []
    for req, lawyer_user, profile in rows:
        out.append(
            CaseRequestOut(
                id=req.id,
                case_id=req.case_id,
                lawyer_id=req.lawyer_id,
                message=req.message,
                status=req.status,
                created_at=req.created_at,
                lawyer=LawyerSummaryOut(
                    id=lawyer_user.id,
                    full_name=lawyer_user.full_name,
                    profile_id=getattr(profile, "id", None),
                    district=getattr(profile, "district", None),
                    verified=bool(profile.is_verified) if profile is not None else None,
                ),
            )
        )
    return out


@router.patch("/{case_id}/requests/{request_id}", response_model=CaseRequestOut)
def update_case_request_status(
    case_id: int,
    request_id: int,
    payload: RequestStatusUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    case = _get_case_or_404(db, case_id)
    _ensure_client(current_user)
    _ensure_case_owner(current_user, case)

    request = (
        db.query(CaseRequest)
        .filter(CaseRequest.id == request_id, CaseRequest.case_id == case_id)
        .first()
    )
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    request.status = payload.status
    if payload.status == "approved":
        case.selected_lawyer_id = request.lawyer_id

    db.commit()
    db.refresh(request)
    return request


# ✅ NEW: Lawyer can see their own requests (so they know approval)
@router.get("/requests/my", response_model=List[LawyerCaseRequestOut])
def list_my_case_requests(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _ensure_lawyer(current_user)

    rows = (
        db.query(CaseRequest, Case)
        .join(Case, CaseRequest.case_id == Case.id)
        .filter(CaseRequest.lawyer_id == current_user.id)
        .order_by(CaseRequest.created_at.desc())
        .all()
    )

    out: List[LawyerCaseRequestOut] = []
    for req, case in rows:
        out.append(
            LawyerCaseRequestOut(
                id=req.id,
                case_id=req.case_id,
                lawyer_id=req.lawyer_id,
                status=req.status,
                message=req.message,
                created_at=req.created_at,
                case_title=case.title,
                district=case.district,
                category=case.category,
                specialization_id=case.specialization_id,
                specialization_name=case.specialization.name if case.specialization else None,
            )
        )
    return out


@router.get("/{case_id}", response_model=CaseOut)
def get_case(
    case_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    case = _get_case_or_404(db, case_id)
    is_owner = _is_role(current_user, "client") and case.client_id == current_user.id
    is_selected_lawyer = _is_role(current_user, "lawyer") and case.selected_lawyer_id == current_user.id
    is_approved_request = False

    if _is_role(current_user, "lawyer") and not is_selected_lawyer:
        req = (
            db.query(CaseRequest)
            .filter(
                CaseRequest.case_id == case_id,
                CaseRequest.lawyer_id == current_user.id,
                CaseRequest.status == "approved",
            )
            .first()
        )
        is_approved_request = req is not None

    if not (is_owner or is_selected_lawyer or is_approved_request or _is_role(current_user, "admin")):
        raise HTTPException(status_code=403, detail="Not allowed")

    return case
