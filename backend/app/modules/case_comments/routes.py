from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.routers import auth as auth_router
from app.modules.audit_log import service as audit_service
from .schemas import (
    CaseCommentCreate,
    CaseCommentOut,
    CaseCommentVoteCreate,
    CaseCommentVoteOut,
)
from .services import (
    list_case_comment_tree,
    create_case_comment,
    set_comment_vote,
    delete_comment_vote,
    case_exists,
    get_comment,
    get_comment_node,
    get_comment_score_and_vote,
)


router = APIRouter(prefix="/cases", tags=["Case Comments"])
votes_router = APIRouter(prefix="/comments", tags=["Case Comments"])

oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


async def require_user(
    token: str = Depends(oauth2_scheme_optional),
    db: Session = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = auth_router._decode_token(token, "access")
        user = auth_router._get_user_from_payload(payload, db)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def _try_audit(db: Session, user: User, action: str, description: str, meta: dict | None = None):
    try:
        audit_service.log_event(
            db,
            user=user,
            action=action,
            description=description,
            meta=meta,
        )
    except Exception:
        pass


@router.get("/{case_id}/comments", response_model=List[CaseCommentOut])
def list_comments_for_case(
    case_id: int,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    if not case_exists(db, case_id):
        raise HTTPException(status_code=404, detail="Case not found")
    return list_case_comment_tree(
        db,
        case_id,
        limit=limit,
        offset=offset,
        current_user_id=current_user.id,
        include_user_id=True,
        reveal_author_name=True,
    )


@router.post(
    "/{case_id}/comments",
    response_model=CaseCommentOut,
    status_code=status.HTTP_201_CREATED,
)
def create_comment_for_case(
    case_id: int,
    payload: CaseCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
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
    _try_audit(
        db,
        current_user,
        action="case_comment.create",
        description=f"Created case comment {comment.id} on case {case_id}",
        meta={"case_id": case_id, "comment_id": comment.id, "parent_id": parent_id},
    )

    row = get_comment_node(db, comment.id, current_user_id=current_user.id, include_user=True)
    if not row:
        raise HTTPException(status_code=500, detail="Failed to build comment response")
    return row


@votes_router.post("/{comment_id}/vote", response_model=CaseCommentVoteOut)
def vote_on_comment(
    comment_id: int,
    payload: CaseCommentVoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    comment = get_comment(db, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    set_comment_vote(db, comment_id, current_user.id, payload.vote)
    _try_audit(
        db,
        current_user,
        action="case_comment.vote",
        description=f"Voted on case comment {comment_id}",
        meta={"comment_id": comment_id, "vote": payload.vote},
    )
    summary = get_comment_score_and_vote(db, comment_id, current_user.id)
    if not summary:
        raise HTTPException(status_code=404, detail="Comment not found")
    return summary


@votes_router.delete("/{comment_id}/vote", response_model=CaseCommentVoteOut)
def delete_vote_on_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    comment = get_comment(db, comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    delete_comment_vote(db, comment_id, current_user.id)
    _try_audit(
        db,
        current_user,
        action="case_comment.vote_delete",
        description=f"Removed vote on case comment {comment_id}",
        meta={"comment_id": comment_id},
    )
    summary = get_comment_score_and_vote(db, comment_id, current_user.id)
    if not summary:
        raise HTTPException(status_code=404, detail="Comment not found")
    summary["my_vote"] = 0
    return summary
