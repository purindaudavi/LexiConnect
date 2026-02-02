from datetime import datetime
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from starlette.requests import Request
from sqlalchemy import String, cast, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.routers.auth import get_current_user
from .models import AuditLog
from .service import log_event
from .schemas import AuditLogListOut

router = APIRouter(prefix="/api/admin/audit-logs", tags=["Admin Audit Logs"])


def _require_admin(user: User):
    role = getattr(user, "role", None)
    if role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin only")


def _is_dev_mode() -> bool:
    env = os.getenv("ENV", "").lower()
    debug = os.getenv("DEBUG", "").lower()
    return env == "development" or debug == "true"


@router.get("", response_model=AuditLogListOut)
def list_audit_logs(
    action: Optional[str] = Query(None, description="Filter by action"),
    user_email: Optional[str] = Query(None, description="Filter by user email"),
    keyword: Optional[str] = Query(None, description="Search description or meta"),
    success: Optional[bool] = Query(None, description="Filter by success"),
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
        query = query.join(User, User.id == AuditLog.actor_user_id).filter(User.email.ilike(like))

    if keyword:
        like = f"%{keyword}%"
        meta_text = cast(AuditLog.meta, String)
        query = query.filter(or_(AuditLog.description.ilike(like), meta_text.ilike(like)))

    if success is not None:
        dialect = db.bind.dialect.name if db.bind is not None else ""
        if dialect == "postgresql":
            query = query.filter(
                AuditLog.meta["success"].astext == ("true" if success else "false")
            )
        else:
            needle = '"success": true' if success else '"success": false'
            query = query.filter(cast(AuditLog.meta, String).ilike(f"%{needle}%"))

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
    actor_ids = {l.actor_user_id for l in logs if l.actor_user_id}
    actor_email_by_id = {}
    if actor_ids:
        rows = db.query(User.id, User.email).filter(User.id.in_(actor_ids)).all()
        actor_email_by_id = {r.id: r.email for r in rows}
    items = [
        {
            "id": l.id,
            "actor_user_id": l.actor_user_id,
            "actor_email": actor_email_by_id.get(l.actor_user_id),
            "actor_role": (l.meta or {}).get("actor_role"),
            "user_id": l.user_id,
            "action": l.action,
            "description": l.description,
            "meta": l.meta,
            "entity_type": (l.meta or {}).get("entity_type"),
            "entity_id": (l.meta or {}).get("entity_id"),
            "success": (l.meta or {}).get("success"),
            "ip_address": (l.meta or {}).get("ip_address"),
            "user_agent": (l.meta or {}).get("user_agent"),
            "created_at": l.created_at,
        }
        for l in logs
    ]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/dev-generate")
def dev_generate_audit_log(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    if not _is_dev_mode():
        raise HTTPException(
            status_code=403,
            detail="This endpoint is only available in development mode. Set ENV=development or DEBUG=True.",
        )

    entry = log_event(
        db,
        actor=current_user,
        actor_role=str(getattr(current_user, "role", "") or ""),
        action="DEV_SAMPLE_EVENT",
        description="Generated sample audit log entry (dev-only).",
        meta={"note": "dev seed"},
        request=request,
        entity_type="audit_log",
        entity_id="dev-seed",
        success=True,
    )
    return {"id": entry.id}
