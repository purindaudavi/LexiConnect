from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, cast, func, or_
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
    status: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    email: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    failure_reason: Optional[str] = Query(None),
    reason: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    days: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    query = db.query(AuthLog)

    allowed_page_sizes = {10, 20, 50}
    if page_size not in allowed_page_sizes:
        page_size = 10

    parsed_success = success
    if parsed_success is None and status:
        normalized = status.strip().lower()
        if normalized in {"success", "succeeded", "ok", "true", "1"}:
            parsed_success = True
        elif normalized in {"failed", "failure", "error", "false", "0"}:
            parsed_success = False

    if parsed_success is not None:
        query = query.filter(AuthLog.success == parsed_success)

    if email:
        like = f"%{email}%"
        query = query.filter(AuthLog.email.ilike(like))

    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                AuthLog.email.ilike(like),
                cast(AuthLog.user_id, String).ilike(like),
            )
        )

    if event_type:
        query = query.filter(func.upper(AuthLog.event_type) == event_type.strip().upper())

    reason_like = failure_reason or reason
    if reason_like:
        like = f"%{reason_like}%"
        query = query.filter(cast(AuthLog.failure_reason, String).ilike(like))

    if date_from:
        query = query.filter(AuthLog.occurred_at >= date_from)

    if date_to:
        query = query.filter(AuthLog.occurred_at <= date_to)

    if days and days > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        query = query.filter(AuthLog.occurred_at >= cutoff)

    total = query.count()
    items = (
        query.order_by(AuthLog.occurred_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    def _user_name(row: AuthLog) -> Optional[str]:
        if getattr(row, "email", None):
            return str(row.email).split("@", 1)[0] or None
        if getattr(row, "user_id", None):
            return f"user_{row.user_id}"
        return None

    def _created_at_iso(ts: Optional[datetime]) -> Optional[str]:
        if not ts:
            return None
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return ts.isoformat()

    payload_items = []
    for row in items:
        payload_items.append(
            {
                "id": row.id,
                "occurred_at": row.occurred_at,
                "created_at": _created_at_iso(row.occurred_at),
                "event_type": row.event_type,
                "user_id": row.user_id,
                "user_name": _user_name(row),
                "email": row.email,
                "ip": row.ip,
                "user_agent": row.user_agent,
                "success": row.success,
                "failure_reason": row.failure_reason,
                "method": row.method,
            }
        )

    return {"items": payload_items, "page": page, "page_size": page_size, "total": total}
