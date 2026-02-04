from typing import Optional, Iterable, Dict, Any

from sqlalchemy import func, or_, select
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session

from app.models.specialization import Specialization
from app.modules.cases.models import Case
from app.modules.case_comments.models import CaseComment


def public_feed_health() -> dict:
    return {"module": "public_feed", "status": "ok"}


def _comment_count_subquery():
    return (
        select(
            CaseComment.case_id.label("case_id"),
            func.count(CaseComment.id).label("comment_count"),
        )
        .group_by(CaseComment.case_id)
        .subquery()
    )


def _shape_public_case_rows(rows: Iterable) -> list[Dict[str, Any]]:
    out = []
    for row in rows:
        out.append(
            {
                "id": row.id,
                "title": row.title,
                "district": row.district,
                "category": row.category,
                "specialization_id": row.specialization_id,
                "specialization_name": row.specialization_name,
                "created_at": row.created_at,
                "comment_count": int(row.comment_count or 0),
            }
        )
    return out


def list_public_cases(
    db: Session,
    q: Optional[str] = None,
    district: Optional[str] = None,
    specialization_id: Optional[int] = None,
    sort: str = "latest",
    limit: int = 10,
    offset: int = 0,
) -> list[Dict[str, Any]]:
    search = (q or "").strip()
    district = (district or "").strip()

    counts_subq = _comment_count_subquery()
    comment_count_col = func.coalesce(counts_subq.c.comment_count, 0).label("comment_count")

    query = (
        db.query(
            Case.id,
            Case.title,
            Case.district,
            Case.category,
            Case.specialization_id,
            Specialization.name.label("specialization_name"),
            Case.created_at,
            comment_count_col,
        )
        .outerjoin(Specialization, Specialization.id == Case.specialization_id)
        .outerjoin(counts_subq, counts_subq.c.case_id == Case.id)
    )

    if search:
        query = query.filter(
            or_(
                Case.title.ilike(f"%{search}%"),
                Case.summary_public.ilike(f"%{search}%"),
            )
        )
    if district:
        query = query.filter(Case.district == district)
    if specialization_id is not None:
        query = query.filter(Case.specialization_id == specialization_id)

    if sort == "most_commented":
        query = query.order_by(comment_count_col.desc(), Case.created_at.desc())
    else:
        query = query.order_by(Case.created_at.desc())

    try:
        rows = query.limit(limit).offset(offset).all()
        return _shape_public_case_rows(rows)
    except ProgrammingError:
        db.rollback()

    # Fallback when case_comments table doesn't exist yet.
    fallback = (
        db.query(
            Case.id,
            Case.title,
            Case.district,
            Case.category,
            Case.specialization_id,
            Specialization.name.label("specialization_name"),
            Case.created_at,
        )
        .outerjoin(Specialization, Specialization.id == Case.specialization_id)
        .order_by(Case.created_at.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )

    return [
        {
            "id": row.id,
            "title": row.title,
            "district": row.district,
            "category": row.category,
            "specialization_id": row.specialization_id,
            "specialization_name": row.specialization_name,
            "created_at": row.created_at,
            "comment_count": 0,
        }
        for row in fallback
    ]


def get_public_case_detail(db: Session, case_id: int) -> Optional[Dict[str, Any]]:
    counts_subq = _comment_count_subquery()
    comment_count_col = func.coalesce(counts_subq.c.comment_count, 0).label("comment_count")

    query = (
        db.query(
            Case.id,
            Case.title,
            Case.district,
            Case.category,
            Case.specialization_id,
            Specialization.name.label("specialization_name"),
            Case.created_at,
            Case.summary_public,
            Case.status,
            comment_count_col,
        )
        .outerjoin(Specialization, Specialization.id == Case.specialization_id)
        .outerjoin(counts_subq, counts_subq.c.case_id == Case.id)
        .filter(Case.id == case_id)
    )

    try:
        row = query.first()
    except ProgrammingError:
        db.rollback()
        row = (
            db.query(
                Case.id,
                Case.title,
                Case.district,
                Case.category,
                Case.specialization_id,
                Specialization.name.label("specialization_name"),
                Case.created_at,
                Case.summary_public,
                Case.status,
            )
            .outerjoin(Specialization, Specialization.id == Case.specialization_id)
            .filter(Case.id == case_id)
            .first()
        )

        if not row:
            return None

        return {
            "id": row.id,
            "title": row.title,
            "district": row.district,
            "category": row.category,
            "specialization_id": row.specialization_id,
            "specialization_name": row.specialization_name,
            "created_at": row.created_at,
            "summary_public": row.summary_public,
            "status": row.status,
            "comment_count": 0,
        }

    if not row:
        return None

    return {
        "id": row.id,
        "title": row.title,
        "district": row.district,
        "category": row.category,
        "specialization_id": row.specialization_id,
        "specialization_name": row.specialization_name,
        "created_at": row.created_at,
        "summary_public": row.summary_public,
        "status": row.status,
        "comment_count": int(row.comment_count or 0),
    }
