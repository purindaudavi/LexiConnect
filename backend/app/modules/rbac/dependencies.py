from __future__ import annotations

from typing import Iterable

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers.auth import get_current_user
from app.modules.rbac.services import get_user_effective_privilege_keys


def get_current_user_privileges(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
) -> set[str]:
    return get_user_effective_privilege_keys(db, current_user.id)


def require_privilege(key: str):
    def _dependency(privileges: set[str] = Depends(get_current_user_privileges)) -> None:
        if key not in privileges:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"detail": "Missing privilege", "required_privilege": key},
            )

    return _dependency


def require_any_privilege(keys: Iterable[str]):
    keys_list = list(keys)

    def _dependency(privileges: set[str] = Depends(get_current_user_privileges)) -> None:
        if not any(key in privileges for key in keys_list):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"detail": "Missing privilege", "required_privilege": keys_list},
            )

    return _dependency
