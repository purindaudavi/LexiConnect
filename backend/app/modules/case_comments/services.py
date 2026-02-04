from typing import Optional, Iterable, Dict, Any, List

import logging
from sqlalchemy import func, literal
from sqlalchemy.orm import Session

from app.modules.cases.models import Case
from app.models.user import User
from .models import CaseComment, CaseCommentVote


logger = logging.getLogger(__name__)


def _score_subquery(db: Session):
    return (
        db.query(
            CaseCommentVote.comment_id.label("comment_id"),
            func.coalesce(func.sum(CaseCommentVote.vote), 0).label("score"),
        )
        .group_by(CaseCommentVote.comment_id)
        .subquery()
    )


def _shape_comment_rows(rows: Iterable, include_user: bool) -> list[Dict[str, Any]]:
    out = []
    for row in rows:
        item = {
            "id": row.id,
            "case_id": row.case_id,
            "parent_id": row.parent_id,
            "content": row.content,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
            "score": int(row.score or 0),
        }
        if include_user:
            item["user_id"] = row.user_id
        out.append(item)
    return out


def _role_str(value) -> str:
    role = getattr(value, "value", value)
    return str(role or "").lower() or "client"


def _author_display_name(role_value, name: Optional[str], reveal: bool) -> str:
    role = _role_str(role_value)
    safe_name = (name or "").strip() or None
    if reveal:
        return safe_name or "Unknown"
    return "Verified Lawyer" if role == "lawyer" else "Client"


def _pick_user_name(row) -> Optional[str]:
    value = getattr(row, "full_name", None)
    if value:
        return str(value)
    value = getattr(row, "name", None)
    if value:
        return str(value)
    first = getattr(row, "first_name", None)
    last = getattr(row, "last_name", None)
    if first or last:
        return f"{first or ''} {last or ''}".strip()
    email = getattr(row, "email", None)
    if email and "@" in str(email):
        return str(email).split("@", 1)[0]
    return None


def list_case_comment_tree(
    db: Session,
    case_id: int,
    limit: int = 200,
    offset: int = 0,
    current_user_id: Optional[int] = None,
    include_user_id: bool = False,
    reveal_author_name: bool = False,
    sort: str = "newest",
) -> List[Dict[str, Any]]:
    try:
        score_subq = _score_subquery(db)
        my_vote_subq = None
        if current_user_id is not None:
            my_vote_subq = (
                db.query(
                    CaseCommentVote.comment_id.label("comment_id"),
                    CaseCommentVote.vote.label("my_vote"),
                )
                .filter(CaseCommentVote.user_id == current_user_id)
                .subquery()
            )

        my_vote_col = (
            my_vote_subq.c.my_vote if my_vote_subq is not None else literal(None)
        ).label("my_vote")

        fields = [
            CaseComment.id,
            CaseComment.case_id,
            CaseComment.user_id,
            CaseComment.parent_id,
            CaseComment.content,
            CaseComment.created_at,
            CaseComment.updated_at,
            User.role.label("author_role"),
            func.coalesce(score_subq.c.score, 0).label("score"),
            my_vote_col,
        ]
        if hasattr(User, "full_name"):
            fields.append(User.full_name.label("full_name"))
        if hasattr(User, "first_name"):
            fields.append(User.first_name.label("first_name"))
        if hasattr(User, "last_name"):
            fields.append(User.last_name.label("last_name"))
        if hasattr(User, "name"):
            fields.append(User.name.label("name"))
        if hasattr(User, "email"):
            fields.append(User.email.label("email"))

        if sort == "oldest":
            order_by = [CaseComment.created_at.asc()]
        elif sort == "top":
            order_by = [
                func.coalesce(score_subq.c.score, 0).desc(),
                CaseComment.created_at.desc(),
            ]
        else:
            order_by = [CaseComment.created_at.desc()]

        query = (
            db.query(*fields)
            .outerjoin(User, User.id == CaseComment.user_id)
            .outerjoin(score_subq, score_subq.c.comment_id == CaseComment.id)
            .filter(CaseComment.case_id == case_id)
            .order_by(*order_by)
        )

        if my_vote_subq is not None:
            query = query.outerjoin(my_vote_subq, my_vote_subq.c.comment_id == CaseComment.id)

        query = query.limit(limit).offset(offset)

        rows = query.all()
    except Exception:
        logger.exception("Failed to list case comment tree for case_id=%s", case_id)
        raise

    reply_counts: Dict[Optional[int], int] = {}
    for row in rows:
        if row.parent_id is not None:
            reply_counts[row.parent_id] = reply_counts.get(row.parent_id, 0) + 1

    nodes: Dict[int, Dict[str, Any]] = {}
    for row in rows:
        role_str = _role_str(row.author_role)
        display_name = _pick_user_name(row)
        node = {
            "id": row.id,
            "case_id": row.case_id,
            "parent_id": row.parent_id,
            "content": row.content,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
            "author_id": row.user_id,
            "author_display_name": _author_display_name(
                role_str,
                display_name,
                reveal_author_name,
            ),
            "author_name": display_name,
            "author_role": role_str,
            "score": int(row.score or 0),
            "my_vote": int(row.my_vote or 0) if current_user_id is not None else 0,
            "user_vote": int(row.my_vote or 0) if current_user_id is not None else 0,
            "reply_count": reply_counts.get(row.id, 0),
            "replies": [],
        }
        if include_user_id:
            node["user_id"] = row.user_id
        nodes[row.id] = node

    roots: List[Dict[str, Any]] = []
    for node in nodes.values():
        parent_id = node.get("parent_id")
        if parent_id and parent_id in nodes:
            nodes[parent_id]["replies"].append(node)
        else:
            roots.append(node)

    def _sort_tree(items: List[Dict[str, Any]]):
        if sort == "oldest":
            items.sort(key=lambda x: x["created_at"])
        elif sort == "top":
            items.sort(key=lambda x: (x["score"], x["created_at"]), reverse=True)
        else:
            items.sort(key=lambda x: x["created_at"], reverse=True)
        for item in items:
            if sort == "oldest":
                item["replies"].sort(key=lambda x: x["created_at"])
            else:
                item["replies"].sort(key=lambda x: x["created_at"], reverse=True)
            _sort_tree(item["replies"])

    _sort_tree(roots)
    return roots


def list_case_comments(
    db: Session,
    case_id: int,
    limit: int = 50,
    offset: int = 0,
    include_user: bool = True,
) -> list[Dict[str, Any]]:
    score_subq = _score_subquery(db)

    rows = (
        db.query(
            CaseComment.id,
            CaseComment.case_id,
            CaseComment.user_id,
            CaseComment.parent_id,
            CaseComment.content,
            CaseComment.created_at,
            CaseComment.updated_at,
            func.coalesce(score_subq.c.score, 0).label("score"),
        )
        .outerjoin(score_subq, score_subq.c.comment_id == CaseComment.id)
        .filter(CaseComment.case_id == case_id)
        .order_by(CaseComment.created_at.asc())
        .limit(limit)
        .offset(offset)
        .all()
    )

    return _shape_comment_rows(rows, include_user=include_user)


def get_comment_node(
    db: Session,
    comment_id: int,
    current_user_id: Optional[int] = None,
    include_user: bool = True,
) -> Optional[Dict[str, Any]]:
    score_subq = _score_subquery(db)
    my_vote_subq = None
    if current_user_id is not None:
        my_vote_subq = (
            db.query(
                CaseCommentVote.comment_id.label("comment_id"),
                CaseCommentVote.vote.label("my_vote"),
            )
            .filter(CaseCommentVote.user_id == current_user_id)
            .subquery()
        )

    my_vote_col = (
        my_vote_subq.c.my_vote if my_vote_subq is not None else literal(None)
    ).label("my_vote")

    fields = [
        CaseComment.id,
        CaseComment.case_id,
        CaseComment.user_id,
        CaseComment.parent_id,
        CaseComment.content,
        CaseComment.created_at,
        CaseComment.updated_at,
        User.role.label("author_role"),
        func.coalesce(score_subq.c.score, 0).label("score"),
        my_vote_col,
    ]
    if hasattr(User, "full_name"):
        fields.append(User.full_name.label("full_name"))
    if hasattr(User, "first_name"):
        fields.append(User.first_name.label("first_name"))
    if hasattr(User, "last_name"):
        fields.append(User.last_name.label("last_name"))
    if hasattr(User, "name"):
        fields.append(User.name.label("name"))
    if hasattr(User, "email"):
        fields.append(User.email.label("email"))
    if hasattr(User, "username"):
        fields.append(User.username.label("username"))

    query = (
        db.query(*fields)
        .outerjoin(User, User.id == CaseComment.user_id)
        .outerjoin(score_subq, score_subq.c.comment_id == CaseComment.id)
        .filter(CaseComment.id == comment_id)
    )

    if my_vote_subq is not None:
        query = query.outerjoin(my_vote_subq, my_vote_subq.c.comment_id == CaseComment.id)

    row = query.first()
    if not row:
        return None

    role_str = _role_str(row.author_role)
    display_name = _pick_user_name(row)
    item = {
        "id": row.id,
        "case_id": row.case_id,
        "parent_id": row.parent_id,
        "content": row.content,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "author_id": row.user_id,
        "author_display_name": _author_display_name(role_str, display_name, True),
        "author_name": display_name,
        "author_role": role_str,
        "score": int(row.score or 0),
        "my_vote": int(row.my_vote or 0) if current_user_id is not None else 0,
        "user_vote": int(row.my_vote or 0) if current_user_id is not None else 0,
        "reply_count": 0,
        "replies": [],
    }
    if include_user:
        item["user_id"] = row.user_id
    return item


def get_comment_score_and_vote(
    db: Session,
    comment_id: int,
    current_user_id: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    score_subq = _score_subquery(db)
    my_vote_subq = None
    if current_user_id is not None:
        my_vote_subq = (
            db.query(
                CaseCommentVote.comment_id.label("comment_id"),
                CaseCommentVote.vote.label("my_vote"),
            )
            .filter(CaseCommentVote.user_id == current_user_id)
            .subquery()
        )

    my_vote_col = (
        my_vote_subq.c.my_vote if my_vote_subq is not None else literal(None)
    ).label("my_vote")

    query = (
        db.query(
            CaseComment.id.label("comment_id"),
            func.coalesce(score_subq.c.score, 0).label("score"),
            my_vote_col,
        )
        .outerjoin(score_subq, score_subq.c.comment_id == CaseComment.id)
        .filter(CaseComment.id == comment_id)
    )

    if my_vote_subq is not None:
        query = query.outerjoin(my_vote_subq, my_vote_subq.c.comment_id == CaseComment.id)

    row = query.first()
    if not row:
        return None

    return {
        "comment_id": row.comment_id,
        "score": int(row.score or 0),
        "my_vote": int(row.my_vote or 0) if current_user_id is not None else 0,
    }


def create_case_comment(
    db: Session,
    case_id: int,
    user_id: int,
    content: str,
    parent_id: Optional[int] = None,
) -> CaseComment:
    comment = CaseComment(
        case_id=case_id,
        user_id=user_id,
        parent_id=parent_id,
        content=content,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def set_comment_vote(
    db: Session,
    comment_id: int,
    user_id: int,
    vote: int,
) -> Optional[CaseCommentVote]:
    if vote == 0:
        row = (
            db.query(CaseCommentVote)
            .filter(
                CaseCommentVote.comment_id == comment_id,
                CaseCommentVote.user_id == user_id,
            )
            .first()
        )
        if not row:
            return None
        db.delete(row)
        db.commit()
        return None

    row = (
        db.query(CaseCommentVote)
        .filter(
            CaseCommentVote.comment_id == comment_id,
            CaseCommentVote.user_id == user_id,
        )
        .first()
    )
    if row:
        row.vote = vote
    else:
        row = CaseCommentVote(
            comment_id=comment_id,
            user_id=user_id,
            vote=vote,
        )
        db.add(row)

    db.commit()
    db.refresh(row)
    return row


def delete_comment_vote(db: Session, comment_id: int, user_id: int) -> bool:
    row = (
        db.query(CaseCommentVote)
        .filter(
            CaseCommentVote.comment_id == comment_id,
            CaseCommentVote.user_id == user_id,
        )
        .first()
    )
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def case_exists(db: Session, case_id: int) -> bool:
    return db.query(Case.id).filter(Case.id == case_id).first() is not None


def get_comment(db: Session, comment_id: int) -> Optional[CaseComment]:
    return db.query(CaseComment).filter(CaseComment.id == comment_id).first()
