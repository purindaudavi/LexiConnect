from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.rbac.models import Privilege, RolePrivilege, UserPrivilegeOverride, UserRole


def _get_cache(db: Session) -> dict:
    return db.info.setdefault("rbac_cache", {})


def get_user_roles(db: Session, user_id: int) -> list[str]:
    cache = _get_cache(db)
    cache_key = f"user_roles:{user_id}"
    if cache_key in cache:
        return cache[cache_key]

    stmt = (
        select(UserRole.role_id)
        .where(UserRole.user_id == user_id)
    )
    role_ids = [row[0] for row in db.execute(stmt).all()]
    cache[cache_key] = role_ids
    return role_ids


def get_user_effective_privilege_keys(db: Session, user_id: int) -> set[str]:
    cache = _get_cache(db)
    cache_key = f"user_privileges:{user_id}"
    if cache_key in cache:
        return cache[cache_key]

    role_ids = get_user_roles(db, user_id)
    privilege_keys: set[str] = set()

    if role_ids:
        stmt = (
            select(Privilege.key)
            .select_from(RolePrivilege)
            .join(Privilege, Privilege.id == RolePrivilege.privilege_id)
            .where(RolePrivilege.role_id.in_(role_ids))
        )
        privilege_keys.update(row[0] for row in db.execute(stmt).all())

    overrides_stmt = (
        select(UserPrivilegeOverride.effect, Privilege.key)
        .select_from(UserPrivilegeOverride)
        .join(Privilege, Privilege.id == UserPrivilegeOverride.privilege_id)
        .where(UserPrivilegeOverride.user_id == user_id)
    )
    for effect, key in db.execute(overrides_stmt).all():
        if str(effect) == "grant":
            privilege_keys.add(key)
        else:
            privilege_keys.discard(key)

    cache[cache_key] = privilege_keys
    return privilege_keys


def user_has_privilege(db: Session, user_id: int, key: str) -> bool:
    return key in get_user_effective_privilege_keys(db, user_id)
