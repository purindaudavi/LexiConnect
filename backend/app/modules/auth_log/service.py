from typing import Optional
from uuid import UUID

from starlette.requests import Request
from sqlalchemy.orm import Session

from .models import AuthLog


def create_auth_log(
    db: Session,
    *,
    event_type: str,
    success: bool,
    user_id: Optional[UUID] = None,
    email: Optional[str] = None,
    failure_reason: Optional[str] = None,
    method: Optional[str] = None,
    request: Optional[Request] = None,
    commit: bool = True,
) -> AuthLog:
    entry = AuthLog(
        event_type=event_type,
        user_id=user_id,
        email=email,
        ip=request.client.host if request and request.client else None,
        user_agent=request.headers.get("user-agent") if request else None,
        success=success,
        failure_reason=failure_reason,
        method=method,
    )
    db.add(entry)
    if commit:
        db.commit()
        db.refresh(entry)
    else:
        db.flush()
    return entry
