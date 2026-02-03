from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, cast, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.routers.auth import get_current_user
from .models import AuthLog
from .schemas import AuthLogListOut

router = APIRouter(prefix="/api/auth-logs", tags=["Auth Log"])


def _require_admin(user: User):
    role = getattr(user, "role", None)
    if role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin only")


@router.get("", response_model=AuthLogListOut)
def list_auth_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    success: Optional[bool] = Query(None),
    email: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    failure_reason: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    query = db.query(AuthLog)

    if success is not None:
        query = query.filter(AuthLog.success == success)

    if email:
        like = f"%{email}%"
        query = query.filter(AuthLog.email.ilike(like))

    if event_type:
        query = query.filter(func.upper(AuthLog.event_type) == event_type.strip().upper())

    if failure_reason:
        like = f"%{failure_reason}%"
        query = query.filter(cast(AuthLog.failure_reason, String).ilike(like))

    if date_from:
        query = query.filter(AuthLog.occurred_at >= date_from)

    if date_to:
        query = query.filter(AuthLog.occurred_at <= date_to)

    total = query.count()
    items = (
        query.order_by(AuthLog.occurred_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {"items": items, "page": page, "page_size": page_size, "total": total}
