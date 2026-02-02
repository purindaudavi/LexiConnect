from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from sqlalchemy import or_

from app.database import get_db
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.checklist_template import ChecklistTemplate
from app.models.booking_checklist_answer import BookingChecklistAnswer
from app.models.booking import Booking
from app.modules.cases.models import Case, CaseRequest

from app.modules.checklist_templates.schemas import (
    ChecklistTemplateCreate,
    ChecklistTemplateUpdate,
    ChecklistTemplateResponse,
)
from app.modules.checklist_templates import service


router = APIRouter(prefix="/api/checklist-templates", tags=["Checklist Templates"])


@router.post("", response_model=ChecklistTemplateResponse, status_code=status.HTTP_201_CREATED)
def create_checklist_template(
    payload: ChecklistTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "lawyer":
        raise HTTPException(status_code=403, detail="Only lawyers can create checklist templates")

    lawyer = service.get_lawyer_by_user(db, current_user.id)
    return service.create_template(db, lawyer, payload)


@router.get("/me", response_model=List[ChecklistTemplateResponse])
def get_my_checklist_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "lawyer":
        raise HTTPException(status_code=403, detail="Only lawyers can view checklist templates")

    lawyer = service.get_lawyer_by_user(db, current_user.id)
    return service.get_my_templates(db, lawyer)


@router.patch("/{template_id}", response_model=ChecklistTemplateResponse)
def update_checklist_template(
    template_id: int,
    payload: ChecklistTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lawyer = service.get_lawyer_by_user(db, current_user.id)

    template = (
        db.query(ChecklistTemplate)
        .filter(ChecklistTemplate.id == template_id, ChecklistTemplate.lawyer_id == lawyer.id)
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Checklist template not found")

    return service.update_template(db, template, payload)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checklist_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lawyer = service.get_lawyer_by_user(db, current_user.id)

    template = (
        db.query(ChecklistTemplate)
        .filter(ChecklistTemplate.id == template_id, ChecklistTemplate.lawyer_id == lawyer.id)
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Checklist template not found")

    service.delete_template(db, template)


@router.get("/service-packages/{service_package_id}/required")
def get_required_templates_for_service_package(
    service_package_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Auth: any authenticated user can view required templates
    service_col = getattr(ChecklistTemplate, "service_package_id", None)
    required_col = getattr(ChecklistTemplate, "required", None)
    question_col = getattr(ChecklistTemplate, "question", None)
    helper_col = getattr(ChecklistTemplate, "helper_text", None)

    if service_col is None or required_col is None or question_col is None or helper_col is None:
        raise HTTPException(status_code=500, detail="Checklist template model missing required fields")

    templates = (
        db.query(ChecklistTemplate)
        .filter(
            required_col.is_(True),
            or_(service_col == service_package_id, service_col.is_(None)),
        )
        .all()
    )

    return [
        {
            "id": t.id,
            "question": getattr(t, "question", None),
            "helper_text": getattr(t, "helper_text", None),
            "required": getattr(t, "required", None),
        }
        for t in templates
    ]


@router.get("/cases/{case_id}/checklist/status")
def get_case_checklist_status(
    case_id: int,
    service_package_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    is_client_owner = getattr(current_user, "role", None) == "client" and case.client_id == current_user.id
    is_selected_lawyer = getattr(current_user, "role", None) == "lawyer" and case.selected_lawyer_id == current_user.id
    approved_request = None
    booking_link = None

    if getattr(current_user, "role", None) == "lawyer" and not is_selected_lawyer:
        approved_request = (
            db.query(CaseRequest)
            .filter(
                CaseRequest.case_id == case_id,
                CaseRequest.lawyer_id == current_user.id,
                CaseRequest.status == "approved",
            )
            .first()
        )
        booking_link = (
            db.query(Booking)
            .filter(
                Booking.case_id == case_id,
                Booking.lawyer_id == current_user.id,
            )
            .first()
        )

    if not (
        is_client_owner
        or is_selected_lawyer
        or approved_request is not None
        or (booking_link is not None)
        or getattr(current_user, "role", None) == "admin"
    ):
        raise HTTPException(status_code=403, detail="Not allowed")

    # Resolve service_package_id
    chosen_sp_id = service_package_id
    if chosen_sp_id is None:
        latest_booking = (
            db.query(Booking)
            .filter(Booking.case_id == case_id, Booking.service_package_id.isnot(None))
            .order_by(Booking.created_at.desc())
            .first()
        )
        if latest_booking:
            chosen_sp_id = latest_booking.service_package_id

    if chosen_sp_id is None:
        raise HTTPException(status_code=422, detail="service_package_id required")

    # Ensure the ChecklistTemplate has expected columns
    service_col = getattr(ChecklistTemplate, "service_package_id", None)
    required_col = getattr(ChecklistTemplate, "required", None)
    question_col = getattr(ChecklistTemplate, "question", None)
    helper_col = getattr(ChecklistTemplate, "helper_text", None)
    if service_col is None or required_col is None or question_col is None or helper_col is None:
        raise HTTPException(status_code=500, detail="Checklist template model missing required fields")

    required_templates = (
        db.query(ChecklistTemplate)
        .filter(
            required_col.is_(True),
            or_(service_col == chosen_sp_id, service_col.is_(None)),
        )
        .all()
    )

    template_ids = [t.id for t in required_templates]
    if not template_ids:
        return {
            "case_id": case_id,
            "total_required": 0,
            "completed_required": 0,
            "missing_required": [],
        }

    booking_ids = [
        b.id
        for b in db.query(Booking.id)
        .filter(Booking.case_id == case_id)
        .all()
    ]
    booking_ids = [b if isinstance(b, int) else b[0] for b in booking_ids]

    answer_case_col = getattr(BookingChecklistAnswer, "case_id", None)
    filters = [BookingChecklistAnswer.template_id.in_(template_ids)]
    if answer_case_col is not None:
        filters.append(
            or_(
                BookingChecklistAnswer.booking_id.in_(booking_ids) if booking_ids else False,
                answer_case_col == case_id,
            )
        )
    else:
        filters.append(BookingChecklistAnswer.booking_id.in_(booking_ids) if booking_ids else False)

    answers = db.query(BookingChecklistAnswer).filter(*filters).all()

    completed = set()
    for ans in answers:
        if (ans.answer_text and ans.answer_text.strip()) or ans.document_id:
            completed.add(ans.template_id)

    missing = [t for t in required_templates if t.id not in completed]

    return {
        "case_id": case_id,
        "total_required": len(required_templates),
        "completed_required": len(completed),
        "missing_required": [
            {
                "id": t.id,
                "title": getattr(t, "question", None) or "",
                "description": getattr(t, "helper_text", None) or "",
            }
            for t in missing
        ],
    }


@router.get("/bookings/{booking_id}/checklist")
def get_booking_checklist(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    # ✅ Lawyer/admin can view
    allowed = (
        getattr(current_user, "role", None) == "admin"
        or (getattr(current_user, "role", None) == "lawyer" and booking.lawyer_id == current_user.id)
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="Not allowed")

    # If no case linked, nothing to show
    if not booking.case_id:
        return {
            "booking_id": booking.id,
            "case_id": booking.case_id,
            "service_package_id": booking.service_package_id,
            "total_required": 0,
            "completed_required": 0,
            "items": [],
            "missing_required": [],
        }

    # ✅ Ensure checklist template fields exist
    service_col = getattr(ChecklistTemplate, "service_package_id", None)
    required_col = getattr(ChecklistTemplate, "required", None)
    question_col = getattr(ChecklistTemplate, "question", None)
    helper_col = getattr(ChecklistTemplate, "helper_text", None)
    if service_col is None or required_col is None or question_col is None or helper_col is None:
        raise HTTPException(status_code=500, detail="Checklist template model missing required fields")

    chosen_sp_id = booking.service_package_id

    # ✅ Templates required for this service package (or global templates where service_package_id is NULL)
    required_templates = (
        db.query(ChecklistTemplate)
        .filter(
            required_col.is_(True),
            or_(service_col == chosen_sp_id, service_col.is_(None)),
        )
        .all()
    )

    template_ids = [t.id for t in required_templates]
    if not template_ids:
        return {
            "booking_id": booking.id,
            "case_id": booking.case_id,
            "service_package_id": booking.service_package_id,
            "total_required": 0,
            "completed_required": 0,
            "items": [],
            "missing_required": [],
        }

    # ✅ Pull answers from:
    # - any booking under same case
    # - OR answers saved directly with case_id
    case_booking_ids = [
        r[0]
        for r in db.query(Booking.id)
        .filter(Booking.case_id == booking.case_id)
        .all()
    ]

    answers = (
        db.query(BookingChecklistAnswer)
        .filter(
            BookingChecklistAnswer.template_id.in_(template_ids),
            or_(
                BookingChecklistAnswer.booking_id.in_(case_booking_ids) if case_booking_ids else False,
                BookingChecklistAnswer.case_id == booking.case_id,
            ),
        )
        .order_by(BookingChecklistAnswer.created_at.desc())
        .all()
    )

    # ✅ Keep latest answer per template
    answer_map = {}
    for a in answers:
        if a.template_id not in answer_map:
            answer_map[a.template_id] = a

    completed_required = 0
    items = []
    missing_required = []

    for t in required_templates:
        ans = answer_map.get(t.id)

        has_answer = False
        if ans:
            has_text = (ans.answer_text or "").strip() != ""
            has_doc = bool(ans.document_id)
            has_answer = has_text or has_doc

        if has_answer:
            completed_required += 1
        else:
            missing_required.append(
                {"template_id": t.id, "question": getattr(t, "question", None)}
            )

        items.append(
            {
                "template_id": t.id,
                "question": getattr(t, "question", None),
                "helper_text": getattr(t, "helper_text", None),
                "required": getattr(t, "required", None),
                "answer_text": ans.answer_text if ans else None,
                "document_id": ans.document_id if ans else None,
                "answered_at": ans.created_at if ans else None,
                "answer_booking_id": ans.booking_id if ans else None,  # helpful debug
                "answer_case_id": ans.case_id if ans else None,        # helpful debug
            }
        )

    return {
        "booking_id": booking.id,
        "case_id": booking.case_id,
        "service_package_id": booking.service_package_id,
        "total_required": len(required_templates),
        "completed_required": completed_required,
        "items": items,
        "missing_required": missing_required,
    }

