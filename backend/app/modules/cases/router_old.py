from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers.auth import get_current_user
from app.models.user import User, UserRole
from app.modules.cases import service
from app.modules.cases.models import Case, CaseRequest
from app.modules.cases.schemas import (
    CaseCreate,
    CaseOut,
    CaseWithRequestsOut,
    CaseRequestCreate,
    CaseRequestOut,
)

router = APIRouter(prefix="/cases", tags=["Cases"])


def _require_role(user: User, role: UserRole):
    if user.role != role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")


def _require_client(user: User):
    _require_role(user, UserRole.client)


def _require_lawyer(user: User):
    _require_role(user, UserRole.lawyer)


def _case_or_404(db: Session, case_id: int) -> Case:
    case = service.get_case(db, case_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    return case


def _filter_case_for_user(db: Session, case: Case, user: User) -> CaseOut:
    """Return CaseOut with private_summary possibly stripped based on permissions."""
    can_view_private = False
    if user.role == UserRole.client and case.client_id == user.id:
        can_view_private = True
    elif user.role == UserRole.lawyer:
        if case.selected_lawyer_id == user.id:
            can_view_private = True
        else:
            approved = (
                db.query(CaseRequest)
                .filter(
                    CaseRequest.case_id == case.id,
                    CaseRequest.lawyer_id == user.id,
                    CaseRequest.status == "approved",
                )
                .first()
            )
            if approved:
                can_view_private = True

    data = CaseOut.model_validate(case)
    if not can_view_private:
        data.private_summary = None
    return data


@router.post("", response_model=CaseOut, status_code=status.HTTP_201_CREATED)
def create_case(
    payload: CaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_client(current_user)
    case = service.create_case(db, current_user, payload)
    return CaseOut.model_validate(case)


@router.get("/my", response_model=List[CaseOut])
def list_my_cases(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_client(current_user)
    cases = service.list_client_cases(db, current_user)
    return [CaseOut.model_validate(c) for c in cases]


@router.get("/{case_id}", response_model=CaseOut)
def get_case_detail(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = _case_or_404(db, case_id)
    return _filter_case_for_user(db, case, current_user)


@router.get("/{case_id}/requests", response_model=List[CaseRequestOut])
def list_case_requests(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = _case_or_404(db, case_id)
    _require_client(current_user)
    if case.client_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    reqs = service.list_requests_for_case(db, case_id)
    return [CaseRequestOut.model_validate(r) for r in reqs]


@router.post("/{case_id}/requests/{request_id}/approve", response_model=CaseOut)
def approve_case_request(
    case_id: int,
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = _case_or_404(db, case_id)
    _require_client(current_user)
    if case.client_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    req = db.query(CaseRequest).filter(CaseRequest.id == request_id, CaseRequest.case_id == case.id).first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")

    case.selected_lawyer_id = req.lawyer_id
    case.status = "active"
    req.status = "approved"
    db.commit()
    db.refresh(case)
    return CaseOut.model_validate(case)


@router.get("/feed", response_model=List[CaseOut])
def list_cases_feed(
    district: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_lawyer(current_user)
    query = db.query(Case).filter(Case.status == "open")
    if district:
        query = query.filter(Case.district == district)
    if category:
        query = query.filter(Case.category == category)
    cases = query.order_by(Case.created_at.desc()).all()
    result = []
    for case in cases:
        data = CaseOut.model_validate(case)
        data.private_summary = None  # lawyers in feed only see public
        result.append(data)
    return result


@router.post("/{case_id}/request-access", response_model=CaseRequestOut, status_code=status.HTTP_201_CREATED)
def request_case_access(
    case_id: int,
    payload: CaseRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_lawyer(current_user)
    case = _case_or_404(db, case_id)
    if case.status not in {"open", "active"}:
        raise HTTPException(status_code=400, detail="Case not available")
    req = service.create_request(db, current_user, case, payload.message)
    return CaseRequestOut.model_validate(req)


@router.get("/requests/my", response_model=List[CaseRequestOut])
def list_my_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_lawyer(current_user)
    reqs = service.list_requests_for_lawyer(db, current_user)
    return [CaseRequestOut.model_validate(r) for r in reqs]
