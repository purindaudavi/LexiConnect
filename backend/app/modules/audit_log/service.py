from typing import Any, Optional

from starlette.requests import Request
from sqlalchemy.orm import Session

from app.models.user import User
from .models import AuditLog


def log_event(
    db: Session,
    *,
    actor: Optional[User] = None,
    user: Optional[User] = None,
    actor_role: Optional[str] = None,
    action: str,
    description: str,
    meta: Optional[Any] = None,
    request: Optional[Request] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    success: bool = True,
    target_user_id: Optional[int] = None,
    commit: bool = True,
) -> AuditLog:
    if actor is None and user is not None:
        actor = user

    if isinstance(meta, dict):
        meta_dict = dict(meta)
    elif meta is None:
        meta_dict = {}
    else:
        meta_dict = {"data": meta}

    meta_dict.update(
        {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "success": success,
            "ip_address": request.client.host if request and request.client else None,
            "user_agent": request.headers.get("user-agent") if request else None,
            "actor_role": actor_role,
        }
    )

    entry = AuditLog(
        actor_user_id=actor.id if actor else None,
        user_id=target_user_id if target_user_id is not None else (actor.id if actor else None),
        action=action,
        description=description,
        meta=meta_dict,
    )
    db.add(entry)
    if commit:
        db.commit()
        db.refresh(entry)
    else:
        db.flush()
    return entry
