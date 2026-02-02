from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.routers.auth import get_current_user
from app.models.user import User, UserRole
from app.models.service_package import ServicePackage
from app.models.checklist_template import ChecklistTemplate
from app.modules.service_packages.schemas import ServicePackagePublicResponse
from app.modules.checklist_templates.schemas import ChecklistTemplatePublicResponse
from app.models.lawyer import Lawyer

router = APIRouter(prefix="/api/lawyers", tags=["Public Lawyer Data"])


def _allow_client_or_lawyer(user: User):
    if user.role not in {UserRole.client, UserRole.lawyer, UserRole.admin}:
        raise HTTPException(status_code=403, detail="Not authorized")


@router.get("/by-user/{user_id}", response_model=dict)
def get_lawyer_by_user_id(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Map a user_id (users table) to the corresponding lawyer profile."""
    _allow_client_or_lawyer(current_user)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    lawyer = db.query(Lawyer).filter(Lawyer.user_id == user.id).first()
    if not lawyer:
        raise HTTPException(status_code=404, detail="Lawyer profile not found for this user")
    return {"lawyer_id": user.id}


@router.get("/{lawyer_id}/service-packages", response_model=List[ServicePackagePublicResponse])
def list_public_service_packages(
    lawyer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _allow_client_or_lawyer(current_user)
    lawyer_row = db.query(Lawyer).filter(Lawyer.user_id == lawyer_id).first()
    if not lawyer_row:
        raise HTTPException(status_code=404, detail="Lawyer profile not found")
    packages = (
        db.query(ServicePackage)
        .filter(ServicePackage.lawyer_id == lawyer_row.id, ServicePackage.active.is_(True))
        .order_by(ServicePackage.id.desc())
        .all()
    )
    return [
        ServicePackagePublicResponse(
            id=pkg.id,
            name=pkg.name,
            description= pkg.description,
            price_lkr=pkg.price,
            duration_minutes=pkg.duration,
        )
        for pkg in packages
    ]


@router.get("/{lawyer_id}/checklist-templates", response_model=List[ChecklistTemplatePublicResponse])
def list_public_checklist_templates(
    lawyer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _allow_client_or_lawyer(current_user)
    lawyer_row = db.query(Lawyer).filter(Lawyer.user_id == lawyer_id).first()
    if not lawyer_row:
        raise HTTPException(status_code=404, detail="Lawyer profile not found")
    templates = (
        db.query(ChecklistTemplate)
        .filter(
            ChecklistTemplate.lawyer_id == lawyer_row.id,
            ChecklistTemplate.is_active.is_(True),
        )
        .order_by(ChecklistTemplate.id.desc())
        .all()
    )
    return [
        ChecklistTemplatePublicResponse(
            id=t.id,
            question=t.question,
            helper_text=t.helper_text,
            required=t.required,
            input_type=t.input_type,
        )
        for t in templates
    ]
