# backend/app/modules/documents/service.py

import os
from uuid import uuid4
from typing import Optional, List
from fastapi import UploadFile
from sqlalchemy import and_, func
from sqlalchemy.orm import Session
from sqlalchemy.exc import ProgrammingError
from .models import DocumentReviewLink
from .models import Document, DocumentComment

UPLOAD_DIR = "uploads/documents"


def _norm_path(p: str) -> str:
    # convert Windows backslashes to URL-friendly slashes
    return p.replace("\\", "/")


def save_upload(file: UploadFile) -> str:
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[1]
    filename = f"{uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, filename)

    with open(path, "wb") as f:
        f.write(file.file.read())

    return _norm_path(path)


def create_document(
    db: Session,
    booking_id: int | None,
    case_id: int | None,
    uploaded_by_user_id: int | None,
    uploaded_by_role: str | None,
    title: str,
    original_filename: str | None,
    file_path: str,
) -> Document:
    doc = Document(
        booking_id=booking_id,
        case_id=case_id,
        uploaded_by_user_id=uploaded_by_user_id,
        uploaded_by_role=uploaded_by_role,
        title=title,
        original_filename=original_filename,
        file_path=_norm_path(file_path),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def list_documents(db: Session, booking_id: Optional[int] = None):
    q = db.query(Document)
    if booking_id is not None:
        q = q.filter(Document.booking_id == booking_id)
    return q.order_by(Document.id.desc()).all()


def get_document(db: Session, doc_id: int) -> Optional[Document]:
    return db.query(Document).filter(Document.id == doc_id).first()


def get_documents_by_case(db: Session, case_id: int):
    return (
        db.query(Document)
        .filter(Document.case_id == case_id)
        .order_by(Document.uploaded_at.desc())
        .all()
    )


def resolve_case_id_from_booking(db: Session, booking_id: Optional[int]) -> Optional[int]:
    if not booking_id:
        return None
    from app.models.booking import Booking  # avoid circular import

    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    return getattr(booking, "case_id", None) if booking else None


def delete_document(db: Session, doc_id: int) -> bool:
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        return False

    if doc.file_path and os.path.exists(doc.file_path):
        try:
            os.remove(doc.file_path)
        except OSError:
            pass

    db.delete(doc)
    db.commit()
    return True


def create_document_for_case(
    db: Session,
    case_id: int,
    title: str,
    file_path: str,
    booking_id: int | None = None,
    uploaded_by_user_id: int | None = None,
    uploaded_by_role: str | None = None,
    original_filename: str | None = None,
) -> Document:
    doc = Document(
        case_id=case_id,
        booking_id=booking_id,
        uploaded_by_user_id=uploaded_by_user_id,
        uploaded_by_role=uploaded_by_role,
        title=title,
        original_filename=original_filename,
        file_path=_norm_path(file_path),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def list_document_comments(db: Session, document_id: int):
    return (
        db.query(DocumentComment)
        .filter(DocumentComment.document_id == document_id)
        .order_by(DocumentComment.created_at.asc())
        .all()
    )


def create_document_comment(
    db: Session,
    document_id: int,
    comment_text: str,
    created_by_user_id: int | None,
    created_by_role: str | None,
):
    comment = DocumentComment(
        document_id=document_id,
        comment_text=comment_text,
        created_by_user_id=created_by_user_id,
        created_by_role=created_by_role,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def get_document_comment_meta(db: Session, doc_ids: list[int]):
    if not doc_ids:
        return {}, {}

    counts = dict(
        db.query(DocumentComment.document_id, func.count(DocumentComment.id))
        .filter(DocumentComment.document_id.in_(doc_ids))
        .group_by(DocumentComment.document_id)
        .all()
    )

    latest_subq = (
        db.query(
            DocumentComment.document_id.label("document_id"),
            func.max(DocumentComment.created_at).label("max_created_at"),
        )
        .filter(DocumentComment.document_id.in_(doc_ids))
        .group_by(DocumentComment.document_id)
        .subquery()
    )

    latest_rows = (
        db.query(DocumentComment)
        .join(
            latest_subq,
            and_(
                DocumentComment.document_id == latest_subq.c.document_id,
                DocumentComment.created_at == latest_subq.c.max_created_at,
            ),
        )
        .order_by(DocumentComment.id.desc())
        .all()
    )

    latest = {}
    for row in latest_rows:
        if row.document_id not in latest:
            latest[row.document_id] = row

    return counts, latest


def get_document_review_links(db: Session, document_id: int) -> List[DocumentReviewLink]:
    return (
        db.query(DocumentReviewLink)
        .filter(DocumentReviewLink.document_id == document_id)
        .order_by(DocumentReviewLink.updated_at.desc())
        .all()
    )


def get_document_review_link_for_apprentice(db: Session, document_id: int, apprentice_id: int) -> Optional[DocumentReviewLink]:
    return (
        db.query(DocumentReviewLink)
        .filter(
            DocumentReviewLink.document_id == document_id,
            DocumentReviewLink.apprentice_id == apprentice_id,
        )
        .first()
    )


def upsert_document_review_link(
    db: Session,
    document_id: int,
    apprentice_id: int,
    review_link: str,
    note: Optional[str] = None,
) -> DocumentReviewLink:
    row = get_document_review_link_for_apprentice(db, document_id, apprentice_id)

    if row:
        row.review_link = review_link
        row.note = note
    else:
        row = DocumentReviewLink(
            document_id=document_id,
            apprentice_id=apprentice_id,
            review_link=review_link,
            note=note,
        )
        db.add(row)

    db.commit()
    db.refresh(row)
    return row