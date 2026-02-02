from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.routers.auth import get_current_user
from .models import AuditLog
from .schemas import AuditLogListOut

router = APIRouter(prefix="/api/admin/audit-logs", tags=["Admin Audit Logs"])


def _require_admin(user: User):
    role = getattr(user, "role", None)
    if role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin only")


@router.get("", response_model=AuditLogListOut)
def list_audit_logs(
    action: Optional[str] = Query(None, description="Filter by action"),
    user_email: Optional[str] = Query(None, description="Filter by user email"),
    date_from: Optional[datetime] = Query(None, description="Filter from date (inclusive)"),
    date_to: Optional[datetime] = Query(None, description="Filter to date (inclusive)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)

    query = db.query(AuditLog)

    if action:
        query = query.filter(AuditLog.action == action)

    if user_email:
        like = f"%{user_email}%"
        query = query.filter(AuditLog.user_email.ilike(like))

    if date_from:
        query = query.filter(AuditLog.created_at >= date_from)

    if date_to:
        query = query.filter(AuditLog.created_at <= date_to)

    total = query.count()
    logs = (
        query.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "items": logs,
        "total": total,
        "page": page,
        "page_size": page_size,
    }
