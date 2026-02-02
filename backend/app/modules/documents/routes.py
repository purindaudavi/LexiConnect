from typing import Optional, List

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
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
    # optional helpers / new features (apprentice doc reviews)
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

    # (Optional) apprentices booking-doc access: usually NO unless you explicitly want it.
    raise HTTPException(status_code=403, detail="Not allowed")


def _can_access_case(user: User, case: Case, db: Session) -> bool:
    if _is_admin(user):
        return True

    # Client owns the case
    if _is_client(user) and getattr(case, "client_id", None) == user.id:
        return True

    # Lawyer linked via booking
        # Lawyer linked via booking OR selected_lawyer_id on case
    if _is_lawyer(user):
        if getattr(case, "selected_lawyer_id", None) == user.id:
            return True

        conds = [Booking.lawyer_id == user.id]
        if hasattr(Booking, "assigned_lawyer_id"):
            conds.append(Booking.assigned_lawyer_id == user.id)

        linked = (
            db.query(Booking)
            .filter(
                Booking.case_id == case.id,
                or_(*conds),
            )
            .first()
        )
        if linked:
            return True



    # Apprentice access only if assigned to this case
    if _is_apprentice(user):
        try:
            assigned = apprenticeship_service.get_my_assigned_cases(db, user) or []
            assigned_case_ids = set()

            for x in assigned:
                cid = None

                # ✅ service.py returns dicts
                if isinstance(x, dict):
                    cid = x.get("case_id") or x.get("caseId") or x.get("id")

                # ✅ ORM-like objects
                if cid is None:
                    cid = getattr(x, "case_id", None) or getattr(x, "caseId", None)
                if cid is None:
                    cid = getattr(x, "id", None)

                # ✅ nested case object: x.case.id
                if cid is None:
                    case_obj = getattr(x, "case", None)
                    cid = getattr(case_obj, "id", None)

                if cid is not None:
                    assigned_case_ids.add(int(cid))

            return int(case.id) in assigned_case_ids
        except Exception:
            return False

    return False


def _attach_comment_meta(db: Session, docs: List):
    if not docs:
        return docs

    # Default values so response_model still works
    for d in docs:
        setattr(d, "comment_count", 0)
        setattr(d, "latest_comment", None)

    try:
        doc_ids = [d.id for d in docs]
        counts, latest = get_document_comment_meta(db, doc_ids)

        for d in docs:
            setattr(d, "comment_count", counts.get(d.id, 0))
            setattr(d, "latest_comment", latest.get(d.id))
    except ProgrammingError:
        # table doesn't exist (document_comments) -> ignore for now
        db.rollback()
    except Exception:
        # any other unexpected comment-meta crash -> ignore for now
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


def _list_booking_documents(db: Session, current_user: User, booking_id: int):
    booking = _get_booking_or_404(db, booking_id)
    _ensure_can_access_booking_docs(current_user, booking)

    case_id = getattr(booking, "case_id", None)
    if not case_id:
        raise HTTPException(status_code=400, detail="Booking has no case_id")

    # Regression fix: documents are case-owned; booking_id is metadata only.
    # Backfill legacy docs that only had booking_id set.
    legacy_docs = (
        db.query(Document)
        .filter(Document.booking_id == booking_id, Document.case_id.is_(None))
        .all()
    )
    if legacy_docs:
        for doc in legacy_docs:
            doc.case_id = case_id
        db.commit()

    docs = (
        db.query(Document)
        .filter(Document.case_id == case_id)
        .order_by(Document.uploaded_at.desc())
        .all()
    )
    _attach_comment_meta(db, docs)
    return _attach_file_urls(docs)


# -------------------------
# CASE routes
# -------------------------
@router.get("/by-case/{case_id}", response_model=List[DocumentOut])
def list_case_documents(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if not _can_access_case(current_user, case, db):
        raise HTTPException(status_code=403, detail="Not allowed")

    docs = get_documents_by_case(db, case_id)
    return _attach_comment_meta(db, docs)


@router.post("/by-case/{case_id}", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def upload_case_document(
    case_id: int,
    file_name: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if not _can_access_case(current_user, case, db):
        raise HTTPException(status_code=403, detail="Not allowed")

    safe_title = (title or file_name or file.filename or "Untitled").strip()

    try:
        file_path = save_upload(file)

        # IMPORTANT: create_document_for_case MUST NOT require booking_id
        doc = create_document_for_case(
            db,
            case_id=case_id,
            title=safe_title,
            file_path=file_path,
            uploaded_by_user_id=current_user.id,
            uploaded_by_role=_role_str(current_user),
            original_filename=file.filename or safe_title,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload document: {e}")

    _attach_comment_meta(db, [doc])
    return doc


@cases_router.get("/{case_id}/documents", response_model=List[DocumentOut])
def get_case_documents(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = db.query(Case).filter(Case.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if not _can_access_case(current_user, case, db):
        raise HTTPException(status_code=403, detail="Not allowed")

    docs = get_documents_by_case(db, case_id)
    _attach_comment_meta(db, docs)
    return _attach_file_urls(docs)


# -------------------------
# BOOKING upload/list
# -------------------------
@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def upload_document(
    booking_id: int = Form(...),
    file_name: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = _get_booking_or_404(db, booking_id)
    _ensure_can_access_booking_docs(current_user, booking)

    safe_title = (title or file_name or file.filename or "Untitled").strip()
    file_path = save_upload(file)
    case_id = getattr(booking, "case_id", None)
    if not case_id:
        raise HTTPException(status_code=400, detail="Booking has no case_id")

    doc = create_document(
        db,
        booking_id=booking_id,
        case_id=case_id,
        uploaded_by_user_id=current_user.id,
        uploaded_by_role=_role_str(current_user),
        title=safe_title,
        original_filename=file.filename or safe_title,
        file_path=file_path,
    )

    _attach_comment_meta(db, [doc])
    return _attach_file_urls([doc])[0]


@router.get("", response_model=List[DocumentOut])
def get_documents(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _list_booking_documents(db, current_user, booking_id)


@booking_router.get("/{booking_id}/documents", response_model=List[DocumentOut])
def get_booking_documents(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _list_booking_documents(db, current_user, booking_id)


@router.get("/{doc_id}", response_model=DocumentOut)
def get_document_by_id(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = get_document(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    booking = _get_booking_or_404(db, doc.booking_id)
    _ensure_can_access_booking_docs(current_user, booking)

    _attach_comment_meta(db, [doc])
    return doc


@router.get("/{doc_id}/comments", response_model=List[DocumentCommentOut])
def get_document_comments(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = get_document(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    booking = _get_booking_or_404(db, doc.booking_id)
    _ensure_can_access_booking_docs(current_user, booking)

    return list_document_comments(db, doc_id)


@router.post("/{doc_id}/comments", response_model=DocumentCommentOut, status_code=status.HTTP_201_CREATED)
def create_doc_comment(
    doc_id: int,
    payload: DocumentCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = get_document(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    booking = _get_booking_or_404(db, doc.booking_id)
    _ensure_can_access_booking_docs(current_user, booking)

    if not (_is_admin(current_user) or _is_lawyer(current_user)):
        raise HTTPException(status_code=403, detail="Only lawyers or admins can comment")

    comment_text = (payload.comment_text or "").strip()
    if not comment_text:
        raise HTTPException(status_code=400, detail="Comment text is required")

    return create_document_comment(
        db=db,
        document_id=doc_id,
        comment_text=comment_text,
        created_by_user_id=current_user.id,
        created_by_role=_role_str(current_user),
    )


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document_by_id(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = get_document(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    booking = _get_booking_or_404(db, doc.booking_id)
    _ensure_can_access_booking_docs(current_user, booking)

    ok = delete_document(db, doc_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Document not found")
    return None


@router.get("/{doc_id}/review-link", response_model=List[DocumentReviewLinkOut])
def get_review_links_for_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Must be able to access the document's case
    doc = get_document(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if not getattr(doc, "case_id", None):
        raise HTTPException(status_code=400, detail="Document is not linked to a case")

    case = db.query(Case).filter(Case.id == doc.case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if not _can_access_case(current_user, case, db):
        raise HTTPException(status_code=403, detail="Not allowed")

    # Lawyer/Admin can see all review links.
    # Apprentice can only see their own.
    try:
        if _is_admin(current_user) or _is_lawyer(current_user):
            return get_document_review_links(db, doc_id)

        if _is_apprentice(current_user):
            one = get_document_review_link_for_apprentice(db, doc_id, current_user.id)
            return [one] if one else []

        # clients (and others) not allowed
        raise HTTPException(status_code=403, detail="Not allowed")

    except ProgrammingError:
        db.rollback()
        return []


@router.post("/{doc_id}/review-link", response_model=DocumentReviewLinkOut, status_code=status.HTTP_201_CREATED)
def create_or_update_review_link(
    doc_id: int,
    payload: DocumentReviewLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_apprentice(current_user):
        raise HTTPException(status_code=403, detail="Only apprentices can submit review links")

    review_link = (payload.review_link or "").strip()
    note = (payload.note or "").strip() if payload.note else None

    if not review_link:
        raise HTTPException(status_code=400, detail="review_link is required")

    # basic safety: require http/https since it's a public link
    if not (review_link.startswith("http://") or review_link.startswith("https://")):
        raise HTTPException(status_code=400, detail="review_link must start with http:// or https://")

    doc = get_document(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if not getattr(doc, "case_id", None):
        raise HTTPException(status_code=400, detail="Document is not linked to a case")

    case = db.query(Case).filter(Case.id == doc.case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if not _can_access_case(current_user, case, db):
        raise HTTPException(status_code=403, detail="Not allowed")

    try:
        row = upsert_document_review_link(
            db=db,
            document_id=doc_id,
            apprentice_id=current_user.id,
            review_link=review_link,
            note=note,
        )
        return row
    except ProgrammingError:
        db.rollback()
        raise HTTPException(status_code=500, detail="document_review_links table is missing")


@router.get("/{doc_id}/download")
def download_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = get_document(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if not getattr(doc, "case_id", None):
        raise HTTPException(status_code=400, detail="Document is not linked to a case")

    case = db.query(Case).filter(Case.id == doc.case_id).first()
    if not case or not _can_access_case(current_user, case, db):
        raise HTTPException(status_code=403, detail="Not allowed")

    file_path = getattr(doc, "file_path", None)
    if not file_path:
        raise HTTPException(status_code=404, detail="File path missing")

    # Make path absolute if needed (adjust if your app root differs)
    abs_path = file_path
    if not os.path.isabs(abs_path):
        abs_path = os.path.join(os.getcwd(), file_path)

    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="File not found on server")

    filename = getattr(doc, "original_filename", None) or getattr(doc, "title", None) or f"document_{doc_id}"

    # ✅ Forces download
    return FileResponse(
        abs_path,
        filename=filename,
        media_type="application/octet-stream",
    )