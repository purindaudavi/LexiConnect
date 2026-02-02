"""Availability module (Vithana)

Endpoints (mounted by leader):
- POST   /api/availability
- GET    /api/availability/me
- PATCH  /api/availability/{id}
- DELETE /api/availability/{id}
"""

import uuid

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.service_package import ServicePackage
from app.models.user import User, UserRole
from app.models.lawyer import Lawyer
from app.routers.auth import get_current_user
from app.modules.availability.schemas import (
    AvailabilityTemplateCreate,
    AvailabilityTemplateOut,
    AvailabilityTemplateUpdate,
    BookableSlotsByDate,
)
from app.modules.availability.service import (
    create_availability_template,
    delete_availability_template,
    get_bookable_slots,
    list_my_availability,
    resolve_lawyer_user_id,
    update_availability_template,
)

router = APIRouter(prefix="/api/availability", tags=["availability"])


def _require_lawyer(current_user: User) -> None:
    if hasattr(current_user, "role") and current_user.role != "lawyer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only lawyers can access this endpoint",
        )


@router.post("", response_model=AvailabilityTemplateOut, status_code=status.HTTP_201_CREATED)
def create_availability(
    payload: AvailabilityTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_lawyer(current_user)
    template = create_availability_template(db, lawyer_id=current_user.id, payload=payload)
    return AvailabilityTemplateOut.model_validate(template)


@router.get("/me", response_model=list[AvailabilityTemplateOut])
def list_my_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_lawyer(current_user)
    templates = list_my_availability(db, lawyer_id=current_user.id)
    return [AvailabilityTemplateOut.model_validate(t) for t in templates]


@router.patch("/{template_id}", response_model=AvailabilityTemplateOut)
def patch_template(
    template_id: uuid.UUID,
    payload: AvailabilityTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_lawyer(current_user)
    template = update_availability_template(
        db,
        lawyer_id=current_user.id,
        template_id=template_id,
        payload=payload,
    )
    return AvailabilityTemplateOut.model_validate(template)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_lawyer(current_user)
    delete_availability_template(db, lawyer_id=current_user.id, template_id=template_id)
    return None


@router.get("/bookable-slots", response_model=list[BookableSlotsByDate])
def get_bookable_slots_for_lawyer(
    lawyer_id: int | None = Query(default=None),
    lawyer_user_id: int | None = Query(default=None),
    date_from: date = Query(..., description="YYYY-MM-DD"),
    days: int = Query(14, ge=1, le=31),
    service_package_id: int | None = Query(default=None),
    duration_minutes: int | None = Query(default=None, ge=5, le=240),
    branch_id: int | None = Query(default=None),
    step_minutes: int = Query(15, ge=5, le=120),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = str(getattr(current_user, "role", "") or "").lower()
    target_id: int | None = None
    resolved_user_id: int | None = None

    if lawyer_user_id is not None:
        resolved_user_id = lawyer_user_id
    elif lawyer_id is not None:
        target_user = db.query(User).filter(User.id == lawyer_id, User.role == UserRole.lawyer).first()
        if target_user:
            resolved_user_id = target_user.id
        else:
            resolved_user_id = resolve_lawyer_user_id(db, lawyer_id)

    if role == "lawyer":
        target_id = resolved_user_id or current_user.id
        if target_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    else:
        if resolved_user_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="lawyer_user_id is required",
            )
        target_user = db.query(User).filter(User.id == resolved_user_id, User.role == UserRole.lawyer).first()
        if not target_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lawyer not found")
        target_id = resolved_user_id

    lawyer_row = db.query(Lawyer).filter(Lawyer.user_id == target_id).first()

    if service_package_id is not None:
        pkg = db.query(ServicePackage).filter(ServicePackage.id == service_package_id).first()
        if not pkg:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service package not found")
        if not lawyer_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lawyer profile not found")
        if pkg.lawyer_id != lawyer_row.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Service package does not belong to lawyer")
        duration_minutes = int(pkg.duration or 0) or None

    if duration_minutes is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="duration_minutes is required",
        )

    return get_bookable_slots(
        db,
        lawyer_id=target_id,
        date_from=date_from,
        days=days,
        duration_minutes=duration_minutes,
        branch_id=branch_id,
    )
