from typing import Optional, List

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from starlette.requests import Request
from sqlalchemy.orm import Session
from sqlalchemy.exc import ProgrammingError
from sqlalchemy import or_
import os
from fastapi.responses import FileResponse

from app.database import get_db
from app.models.user import User, UserRole
from app.routers.auth import get_current_user
from app.modules.cases.models import Case
from app.models.booking import Booking
from app.modules.documents.models import Document
from app.modules.audit_log.service import log_event

from app.modules.apprenticeship import service as apprenticeship_service

from .schema import (
    DocumentOut,
    DocumentCommentOut,
    DocumentCommentCreate,
    DocumentReviewLinkOut,
    DocumentReviewLinkCreate,
)

from .service import (
    save_upload,
    create_document,
    create_document_for_case,
    get_documents_by_case,
    get_document,
    list_document_comments,
    create_document_comment,
    get_document_comment_meta,
    delete_document,
    resolve_case_id_from_booking,
    get_document_review_links,
    get_document_review_link_for_apprentice,
    upsert_document_review_link,
)


router = APIRouter(prefix="/api/documents", tags=["Documents"])
booking_router = APIRouter(prefix="/api/bookings", tags=["Documents"])
cases_router = APIRouter(prefix="/api/cases", tags=["Documents"])


def _role_str(u: User) -> Optional[str]:
    role = getattr(u, "role", None)
    return str(getattr(role, "value", role) or "").lower() or None


def _is_admin(u: User) -> bool:
    return u.role == UserRole.admin


def _is_client(u: User) -> bool:
    return u.role == UserRole.client


def _is_lawyer(u: User) -> bool:
    return u.role == UserRole.lawyer


def _is_apprentice(u: User) -> bool:
    return u.role == UserRole.apprentice


def _get_booking_or_404(db: Session, booking_id: int) -> Booking:
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


def _booking_client_id(booking: Booking) -> Optional[int]:
    return getattr(booking, "client_id", None) or getattr(booking, "user_id", None)


def _booking_lawyer_id(booking: Booking) -> Optional[int]:
    return getattr(booking, "lawyer_id", None) or getattr(booking, "assigned_lawyer_id", None)


def _ensure_can_access_booking_docs(current_user: User, booking: Booking):
    if _is_admin(current_user):
        return
    if _is_client(current_user):
        if _booking_client_id(booking) != current_user.id:
            raise HTTPException(status_code=403, detail="Not allowed")
        return
    if _is_lawyer(current_user):
        if _booking_lawyer_id(booking) != current_user.id:
            raise HTTPException(status_code=403, detail="Not allowed")
        return
    raise HTTPException(status_code=403, detail="Not allowed")


def _can_access_case(user: User, case: Case, db: Session) -> bool:
    if _is_admin(user):
        return True
    if _is_client(user) and getattr(case, "client_id", None) == user.id:
        return True
    if _is_lawyer(user):
        if getattr(case, "selected_lawyer_id", None) == user.id:
            return True
        conds = [Booking.lawyer_id == user.id]
        if hasattr(Booking, "assigned_lawyer_id"):
            conds.append(Booking.assigned_lawyer_id == user.id)
        linked = (
            db.query(Booking)
            .filter(Booking.case_id == case.id, or_(*conds))
            .first()
        )
        if linked:
            return True
    if _is_apprentice(user):
        try:
            assigned = apprenticeship_service.get_my_assigned_cases(db, user) or []
            assigned_case_ids = set()
            for x in assigned:
                cid = getattr(x, "case_id", None) or getattr(x, "id", None)
                if cid:
                    assigned_case_ids.add(int(cid))
            return int(case.id) in assigned_case_ids
        except Exception:
            return False
    return False


def _attach_comment_meta(db: Session, docs: List):
    if not docs:
        return docs
    for d in docs:
        setattr(d, "comment_count", 0)
        setattr(d, "latest_comment", None)
    try:
        doc_ids = [d.id for d in docs]
        counts, latest = get_document_comment_meta(db, doc_ids)
        for d in docs:
            setattr(d, "comment_count", counts.get(d.id, 0))
            setattr(d, "latest_comment", latest.get(d.id))
    except Exception:
        db.rollback()
    return docs


def _file_url(file_path: Optional[str]) -> Optional[str]:
    if not file_path:
        return None
    path = file_path.replace("\\", "/")
    if "/uploads/" in path:
        path = path.split("/uploads/", 1)[1]
    if path.startswith("/"):
        path = path[1:]
    if path.startswith("uploads/"):
        return f"/{path}"
    return f"/uploads/{path}"


def _attach_file_urls(docs: List):
    for doc in docs or []:
        setattr(doc, "file_url", _file_url(getattr(doc, "file_path", None)))
    return docs


@router.get("/by-case/{case_id}", response_model=List[DocumentOut])
def list_case_documents(case_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case or not _can_access_case(current_user, case, db):
        raise HTTPException(status_code=403, detail="Not allowed")
    docs = get_documents_by_case(db, case_id)
    return _attach_comment_meta(db, docs)


@router.post("/by-case/{case_id}", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def upload_case_document(
    case_id: int,
    file_name: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    file: UploadFile = File(...),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file_path = save_upload(file)
    doc = create_document_for_case(
        db,
        case_id=case_id,
        title=title or file.filename,
        file_path=file_path,
        uploaded_by_user_id=current_user.id,
        uploaded_by_role=_role_str(current_user),
        original_filename=file.filename,
    )
    _attach_comment_meta(db, [doc])
    _attach_file_urls([doc])
    log_event(
        db,
        actor=current_user,
        actor_role=_role_str(current_user),
        action="document_uploaded",
        description=f"Document {doc.id} uploaded for case {case_id}",
        meta={"case_id": case_id, "document_id": doc.id},
        request=request,
        entity_type="document",
        entity_id=str(doc.id),
        success=True,
    )
    return doc


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def upload_document(
    booking_id: int = Form(...),
    title: Optional[str] = Form(None),
    file: UploadFile = File(...),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = _get_booking_or_404(db, booking_id)
    file_path = save_upload(file)
    doc = create_document(
        db,
        booking_id=booking_id,
        case_id=booking.case_id,
        uploaded_by_user_id=current_user.id,
        uploaded_by_role=_role_str(current_user),
        title=title or file.filename,
        original_filename=file.filename,
        file_path=file_path,
    )
    _attach_comment_meta(db, [doc])
    log_event(
        db,
        actor=current_user,
        actor_role=_role_str(current_user),
        action="document_uploaded",
        description=f"Document {doc.id} uploaded for booking {booking_id}",
        meta={"booking_id": booking_id, "document_id": doc.id},
        request=request,
        entity_type="document",
        entity_id=str(doc.id),
        success=True,
    )
    return doc
