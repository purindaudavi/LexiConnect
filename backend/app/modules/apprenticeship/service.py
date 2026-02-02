from sqlalchemy.orm import Session
from sqlalchemy import desc
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from fastapi import HTTPException, status

from app.models.user import User
from app.modules.cases.models import Case
from .models import CaseApprentice, ApprenticeCaseNote


def _role_str(user) -> str:
    role = getattr(user, "role", None)
    if role is None:
        return ""

    # Enum -> role.value
    val = getattr(role, "value", None)
    if val:
        return str(val).lower()

    s = str(role).strip().lower()
    # Handle "UserRole.lawyer"
    if "." in s:
        s = s.split(".")[-1]
    return s


def _is_lawyer(user) -> bool:
    r = _role_str(user)
    return r in ("lawyer", "admin")


def _is_apprentice(user) -> bool:
    r = _role_str(user)
    return r == "apprentice"


def assign_apprentice(db: Session, current_user, case_id: int, apprentice_id: int):
    if not _is_lawyer(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only lawyers can assign apprentices",
        )

    if apprentice_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot assign yourself as an apprentice",
        )

    # Prevent duplicates
    existing = (
        db.query(CaseApprentice)
        .filter(
            CaseApprentice.case_id == case_id,
            CaseApprentice.apprentice_id == apprentice_id,
        )
        .first()
    )
    if existing:
        return existing

    assignment = CaseApprentice(
        case_id=case_id,
        lawyer_id=current_user.id,
        apprentice_id=apprentice_id,
    )

    db.add(assignment)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()

        msg = str(e.orig).lower() if getattr(e, "orig", None) else str(e).lower()

        if "case_apprentices_case_id_fkey" in msg or "key (case_id)" in msg:
            raise HTTPException(status_code=400, detail="Case not found (invalid case_id).")
        if "case_apprentices_apprentice_id_fkey" in msg or "key (apprentice_id)" in msg:
            raise HTTPException(status_code=400, detail="Apprentice user not found (invalid apprentice_id).")
        if "uq_case_apprentices_case_apprentice" in msg or "unique" in msg:
            raise HTTPException(status_code=400, detail="This apprentice is already assigned to this case.")

        raise HTTPException(status_code=400, detail="Failed to assign apprentice (constraint error).")

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error while assigning apprentice.")

    db.refresh(assignment)
    return assignment


def get_my_assigned_cases(db: Session, current_user):
    if not _is_apprentice(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only apprentices can access this endpoint",
        )

    rows = (
        db.query(CaseApprentice, User, Case)
        .join(User, User.id == CaseApprentice.lawyer_id)
        .join(Case, Case.id == CaseApprentice.case_id)
        .filter(CaseApprentice.apprentice_id == current_user.id)
        .order_by(desc(CaseApprentice.created_at))
        .all()
    )

    out = []
    for ca, lawyer, case in rows:
        out.append(
            {
                "id": ca.id,
                "case_id": ca.case_id,
                "lawyer_id": ca.lawyer_id,
                "apprentice_id": ca.apprentice_id,
                "created_at": ca.created_at,

                "lawyer_full_name": lawyer.full_name,
                "lawyer_email": lawyer.email,

                "case_title": case.title,
                "case_category": case.category,
                "case_status": case.status,
                "district": getattr(case, "district", None),

                "supervising_lawyer": lawyer.full_name,
                "lawyer_name": lawyer.full_name,
                "lawyer": lawyer.full_name,
            }
        )

    return out


def _lawyer_can_access_case(db: Session, lawyer_id: int, case_id: int) -> bool:
    return (
        db.query(CaseApprentice)
        .filter(
            CaseApprentice.case_id == case_id,
            CaseApprentice.lawyer_id == lawyer_id,
        )
        .first()
        is not None
    )


def _apprentice_can_access_case(db: Session, apprentice_id: int, case_id: int) -> bool:
    return (
        db.query(CaseApprentice)
        .filter(
            CaseApprentice.case_id == case_id,
            CaseApprentice.apprentice_id == apprentice_id,
        )
        .first()
        is not None
    )


def add_note(db: Session, current_user, case_id: int, note: str):
    role = _role_str(current_user)

    if not note or not note.strip():
        raise HTTPException(status_code=400, detail="Note cannot be empty.")

    # ✅ Apprentice can post only if assigned
    if role == "apprentice":
        if not _apprentice_can_access_case(db, current_user.id, case_id):
            raise HTTPException(status_code=403, detail="You are not assigned to this case")

        # Keep apprentice_id populated (your schema expects it)
        n = ApprenticeCaseNote(
            case_id=case_id,
            apprentice_id=current_user.id,
            author_id=current_user.id,
            author_role="apprentice",
            note=note.strip(),
        )

    # ✅ Lawyer can post only if THEY assigned an apprentice to that case
    elif role in ("lawyer", "admin"):
        if not _lawyer_can_access_case(db, current_user.id, case_id):
            raise HTTPException(status_code=403, detail="Not allowed to add notes for this case")

        # Keep apprentice_id filled with 0? NO. Must be int + FK -> users.id
        # So we set apprentice_id = current_user.id to satisfy NOT NULL + FK.
        # (Later you can make apprentice_id nullable and remove this hack.)
        n = ApprenticeCaseNote(
            case_id=case_id,
            apprentice_id=current_user.id,
            author_id=current_user.id,
            author_role="lawyer",
            note=note.strip(),
        )

    else:
        raise HTTPException(status_code=403, detail="Not allowed")

    db.add(n)

    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error while adding note.")

    db.refresh(n)
    return n


def get_case_notes_for_lawyer(db: Session, current_user, case_id: int):
    role = _role_str(current_user)

    if role == "apprentice":
        if not _apprentice_can_access_case(db, current_user.id, case_id):
            raise HTTPException(status_code=403, detail="Not allowed to view notes for this case")

    elif role in ("lawyer", "admin"):
        if not _lawyer_can_access_case(db, current_user.id, case_id):
            raise HTTPException(status_code=403, detail="Not allowed to view notes for this case")
    else:
        raise HTTPException(status_code=403, detail="Not allowed to view notes for this case")

    notes = (
        db.query(ApprenticeCaseNote)
        .filter(ApprenticeCaseNote.case_id == case_id)
        .order_by(desc(ApprenticeCaseNote.created_at))
        .all()
    )

    # ✅ Backfill older rows (author fields missing)
    for n in notes:
        if getattr(n, "author_id", None) is None:
            n.author_id = n.apprentice_id
        if getattr(n, "author_role", None) is None:
            n.author_role = "apprentice"

    # ✅ Fetch all authors in ONE query
    author_ids = list({n.author_id for n in notes if n.author_id})
    users = db.query(User).filter(User.id.in_(author_ids)).all() if author_ids else []
    user_map = {u.id: u.full_name for u in users}

    # ✅ Return dicts including author_name (Swagger + UI will show names)
    out = []
    for n in notes:
        out.append(
            {
                "id": n.id,
                "case_id": n.case_id,
                "apprentice_id": n.apprentice_id,
                "note": n.note,
                "created_at": n.created_at,
                "author_id": n.author_id,
                "author_role": n.author_role,
                "author_name": user_map.get(n.author_id, None),
            }
        )
    return out

def list_apprentices(db: Session, current_user):
    if not _is_lawyer(current_user):
        raise HTTPException(status_code=403, detail="Only lawyers can access this endpoint")

    apprentices = (
        db.query(User)
        .filter(User.role == "apprentice")
        .order_by(User.full_name.asc())
        .all()
    )

    return [{"id": u.id, "full_name": u.full_name, "email": u.email} for u in apprentices]


def list_my_cases_for_apprenticeship(db: Session, current_user):
    if not _is_lawyer(current_user):
        raise HTTPException(status_code=403, detail="Only lawyers can access this endpoint")

    cases = (
        db.query(Case)
        .filter(Case.selected_lawyer_id == current_user.id)
        .order_by(desc(Case.created_at))
        .all()
    )

    return [
        {
            "id": c.id,
            "title": c.title,
            "district": getattr(c, "district", None),
            "status": getattr(c, "status", None),
            "category": getattr(c, "category", None),
        }
        for c in cases
    ]
