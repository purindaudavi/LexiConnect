from typing import List, Optional, Literal

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.routers import auth as auth_router
from .schemas import PublicCaseListItem, PublicCaseDetailOut
from .services import list_public_cases, get_public_case_detail as get_public_case_detail_service
from app.modules.case_comments.schemas import (
    CaseCommentNode,
    CaseCommentCreate,
    PublicCommentVoteCreate,
    CaseCommentVoteOut,
    CaseCommentListOut,
)
from app.modules.case_comments.services import (
    case_exists,
    list_case_comment_tree,
    create_case_comment,
    get_comment,
    get_comment_node,
    set_comment_vote,
    get_comment_score_and_vote,
)
from app.modules.case_comments.models import CaseComment


router = APIRouter(prefix="/public", tags=["Public Feed"])
logger = logging.getLogger(__name__)
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)
oauth2_scheme_required = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=True)


def _try_get_user(
    token: str | None,
    db: Session,
) -> User | None:
    if not token:
        return None
    try:
        logger.info("public_comments auth token present; attempting decode")
        payload = auth_router._decode_token(token, "access")
        user = auth_router._get_user_from_payload(payload, db)
        logger.info("public_comments auth token valid; user_id=%s", user.id)
        return user
    except JWTError as exc:
        logger.warning(
            "Public comments auth token invalid (%s); falling back to guest.",
            exc.__class__.__name__,
        )
        return None
    except (TypeError, ValueError) as exc:
        logger.warning(
            "Public comments auth token malformed (%s); falling back to guest.",
            exc.__class__.__name__,
        )
        return None
    except Exception:
        logger.exception("Public comments auth token handling failed; falling back to guest.")
        return None


@router.get("/cases", response_model=List[PublicCaseListItem])
def get_public_cases(
    q: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
    specialization_id: Optional[int] = Query(None),
    sort: Literal["latest", "most_commented"] = Query("latest"),
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    return list_public_cases(
        db=db,
        q=q,
        district=district,
        specialization_id=specialization_id,
        sort=sort,
        limit=limit,
        offset=offset,
    )


@router.get("/cases/{case_id}", response_model=PublicCaseDetailOut)
def get_public_case_detail(
    case_id: int,
    db: Session = Depends(get_db),
):
    row = get_public_case_detail_service(db, case_id)
    if not row:
        raise HTTPException(status_code=404, detail="Case not found")
    return row


@router.get("/cases/{case_id}/comments", response_model=CaseCommentListOut)
def get_public_case_comments(
    case_id: int,
    sort: Literal["newest", "oldest", "top"] = Query("newest"),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    token: str | None = Depends(oauth2_scheme_optional),
):
    if not case_exists(db, case_id):
        raise HTTPException(status_code=404, detail="Case not found")
    logger.info(
        "public_comments auth header present=%s case_id=%s sort=%s",
        bool(token),
        case_id,
        sort,
    )
    try:
        db_name = db.execute(text("select current_database()")).scalar()
        row_count = db.execute(
            text("select count(*) from case_comments where case_id = :case_id"),
            {"case_id": case_id},
        ).scalar()
        logger.info(
            "public_comments db=%s case_id=%s count=%s sort=%s",
            db_name,
            case_id,
            row_count,
            sort,
        )
    except Exception:
        logger.exception("Failed to read public comment diagnostics for case_id=%s", case_id)

    current_user = _try_get_user(token, db)
    try:
        logger.info(
            "public_comments list_case_comment_tree start case_id=%s user_id=%s sort=%s limit=%s offset=%s",
            case_id,
            current_user.id if current_user else None,
            sort,
            limit,
            offset,
        )
        results = list_case_comment_tree(
            db,
            case_id,
            limit=limit,
            offset=offset,
            current_user_id=current_user.id if current_user else None,
            include_user_id=False,
            reveal_author_name=True,
            sort=sort,
        )
    except Exception:
        logger.exception("Failed to load public comments for case_id=%s", case_id)
        raise HTTPException(status_code=500, detail="Failed to load comments")

    logger.info("public_comments response case_id=%s items=%s", case_id, len(results))
    return {"items": results}


@router.post("/cases/{case_id}/comments", response_model=CaseCommentNode, status_code=201)
async def create_public_case_comment(
    case_id: int,
    payload: CaseCommentCreate,
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme_required),
):
    try:
        current_user = await auth_router.get_current_user(token=token, db=db)
    except HTTPException as exc:
        if exc.status_code == 401:
            logger.warning("public_comments reject 401 endpoint=create case_id=%s", case_id)
        raise
    logger.info("public_comments create request case_id=%s user_id=%s", case_id, current_user.id)
    if not case_exists(db, case_id):
        raise HTTPException(status_code=404, detail="Case not found")

    parent_id = payload.parent_id
    if parent_id is not None:
        parent = get_comment(db, parent_id)
        if not parent or parent.case_id != case_id:
            raise HTTPException(status_code=400, detail="Invalid parent comment")

    comment = create_case_comment(
        db=db,
        case_id=case_id,
        user_id=current_user.id,
        content=payload.content.strip(),
        parent_id=parent_id,
    )

    row = get_comment_node(db, comment.id, current_user_id=current_user.id, include_user=False)
    if not row:
        logger.error(
            "public_comments create failed to build response case_id=%s comment_id=%s",
            case_id,
            comment.id,
        )
        raise HTTPException(status_code=500, detail="Failed to build comment response")
    return row


@router.post("/comments/{comment_id}/vote", response_model=CaseCommentVoteOut)
async def vote_public_comment(
    comment_id: int,
    payload: PublicCommentVoteCreate,
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme_required),
):
    try:
        current_user = await auth_router.get_current_user(token=token, db=db)
    except HTTPException as exc:
        if exc.status_code == 401:
            logger.warning("public_comments reject 401 endpoint=vote comment_id=%s", comment_id)
        raise
    logger.info("public_comments vote request comment_id=%s user_id=%s", comment_id, current_user.id)
    comment = get_comment(db, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    set_comment_vote(db, comment_id, current_user.id, payload.value)
    summary = get_comment_score_and_vote(db, comment_id, current_user.id)
    if not summary:
        logger.error(
            "public_comments vote failed to build summary comment_id=%s user_id=%s",
            comment_id,
            current_user.id,
        )
        raise HTTPException(status_code=404, detail="Comment not found")
    return summary
