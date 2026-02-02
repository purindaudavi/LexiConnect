from __future__ import annotations

from typing import Dict, List, Tuple

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.user import User, UserRole
from app.modules.rbac.models import (
    Module,
    Privilege,
    Role,
    RolePrivilege,
    UserRole as UserRoleLink,
)

MODULES = [
    {"key": "admin", "name": "Admin", "description": "Administration and access control", "sort_order": 0},
    {"key": "bookings", "name": "Bookings", "description": "Booking management", "sort_order": 10},
    {"key": "cases", "name": "Cases", "description": "Case management", "sort_order": 20},
    {"key": "kyc", "name": "KYC", "description": "Know-your-customer workflow", "sort_order": 30},
    {"key": "audit", "name": "Audit", "description": "Audit logs and reviews", "sort_order": 40},
    {"key": "documents", "name": "Documents", "description": "Document management", "sort_order": 50},
    {"key": "availability", "name": "Availability", "description": "Availability scheduling", "sort_order": 60},
]

ROLES = [
    {"name": "ADMIN", "description": "System administrator", "is_system": True},
    {"name": "LAWYER", "description": "Lawyer role", "is_system": True},
    {"name": "CLIENT", "description": "Client role", "is_system": True},
    {"name": "CLERK", "description": "Clerk role", "is_system": True},
]

PRIVILEGES = [
    {"key": "access_control.manage", "name": "Manage access control", "description": "Manage roles and privileges", "module_key": "admin"},
    {"key": "audit.view", "name": "View audit log", "description": "View audit log entries", "module_key": "audit"},
    {"key": "kyc.approve", "name": "Approve KYC", "description": "Approve KYC submissions", "module_key": "kyc"},
    {"key": "disputes.manage", "name": "Manage disputes", "description": "Resolve disputes", "module_key": "admin"},
    {"key": "booking.confirm", "name": "Confirm booking", "description": "Confirm booking requests", "module_key": "bookings"},
    {"key": "booking.reject", "name": "Reject booking", "description": "Reject booking requests", "module_key": "bookings"},
    {"key": "booking.view", "name": "View bookings", "description": "View booking details", "module_key": "bookings"},
    {"key": "booking.create", "name": "Create booking", "description": "Create new bookings", "module_key": "bookings"},
    {"key": "case.feed.view", "name": "View case feed", "description": "View case feed", "module_key": "cases"},
    {"key": "case.request.create", "name": "Create case request", "description": "Request a case", "module_key": "cases"},
    {"key": "case.request.accept", "name": "Accept case request", "description": "Accept a case request", "module_key": "cases"},
    {"key": "document.upload", "name": "Upload documents", "description": "Upload documents", "module_key": "documents"},
    {"key": "document.view", "name": "View documents", "description": "View documents", "module_key": "documents"},
    {"key": "availability.manage", "name": "Manage availability", "description": "Manage availability schedules", "module_key": "availability"},
    {"key": "token_queue.manage", "name": "Manage token queue", "description": "Manage token queue entries", "module_key": "bookings"},
]

ROLE_PRIVILEGES = {
    "ADMIN": [p["key"] for p in PRIVILEGES],
    "LAWYER": [
        "booking.confirm",
        "booking.reject",
        "booking.view",
        "availability.manage",
        "case.feed.view",
        "case.request.create",
        "document.view",
    ],
    "CLIENT": [
        "booking.create",
        "booking.view",
        "case.request.accept",
        "document.upload",
        "document.view",
    ],
    "CLERK": [
        "booking.view",
        "token_queue.manage",
        "document.view",
    ],
}


def _ensure_modules(db: Session) -> Dict[str, Module]:
    existing = {m.key: m for m in db.query(Module).all()}
    created = 0
    for payload in MODULES:
        if payload["key"] in existing:
            continue
        module = Module(**payload)
        db.add(module)
        existing[payload["key"]] = module
        created += 1
    if created:
        db.commit()
    print(f"[RBAC] Modules: created={created}, existing={len(existing) - created}")
    return existing


def _ensure_roles(db: Session) -> Dict[str, Role]:
    existing = {r.name: r for r in db.query(Role).all()}
    created = 0
    for payload in ROLES:
        if payload["name"] in existing:
            continue
        role = Role(**payload)
        db.add(role)
        existing[payload["name"]] = role
        created += 1
    if created:
        db.commit()
    print(f"[RBAC] Roles: created={created}, existing={len(existing) - created}")
    return existing


def _ensure_privileges(db: Session, modules_by_key: Dict[str, Module]) -> Dict[str, Privilege]:
    existing = {p.key: p for p in db.query(Privilege).all()}
    created = 0
    for payload in PRIVILEGES:
        if payload["key"] in existing:
            continue
        module = modules_by_key.get(payload["module_key"])
        if not module:
            print(f"[RBAC] Privilege skipped; module missing: {payload['module_key']}")
            continue
        privilege = Privilege(
            key=payload["key"],
            name=payload["name"],
            description=payload["description"],
            module_id=module.id,
        )
        db.add(privilege)
        existing[payload["key"]] = privilege
        created += 1
    if created:
        db.commit()
    print(f"[RBAC] Privileges: created={created}, existing={len(existing) - created}")
    return existing


def _ensure_role_privileges(
    db: Session, roles_by_name: Dict[str, Role], privileges_by_key: Dict[str, Privilege]
) -> int:
    existing_pairs: set[Tuple[int, int]] = set(
        db.query(RolePrivilege.role_id, RolePrivilege.privilege_id).all()
    )
    created = 0
    for role_name, privilege_keys in ROLE_PRIVILEGES.items():
        role = roles_by_name.get(role_name)
        if not role:
            continue
        for key in privilege_keys:
            privilege = privileges_by_key.get(key)
            if not privilege:
                continue
            pair = (role.id, privilege.id)
            if pair in existing_pairs:
                continue
            db.add(RolePrivilege(role_id=role.id, privilege_id=privilege.id))
            existing_pairs.add(pair)
            created += 1
    if created:
        db.commit()
    print(f"[RBAC] Role privileges: created={created}")
    return created


def _ensure_user_roles(db: Session, roles_by_name: Dict[str, Role]) -> int:
    existing_pairs: set[Tuple[int, int]] = set(
        db.query(UserRoleLink.user_id, UserRoleLink.role_id).all()
    )
    created = 0
    users = db.query(User).all()
    for user in users:
        role_enum = getattr(user, "role", None)
        if role_enum is None:
            continue
        if isinstance(role_enum, UserRole):
            role_name = role_enum.name.upper()
        else:
            role_name = str(role_enum).upper()
        role = roles_by_name.get(role_name)
        if not role:
            continue
        pair = (user.id, role.id)
        if pair in existing_pairs:
            continue
        db.add(UserRoleLink(user_id=user.id, role_id=role.id))
        existing_pairs.add(pair)
        created += 1
    if created:
        db.commit()
    print(f"[RBAC] User roles: created={created}")
    return created


def seed_rbac(db: Session) -> None:
    modules_by_key = _ensure_modules(db)
    roles_by_name = _ensure_roles(db)
    privileges_by_key = _ensure_privileges(db, modules_by_key)
    _ensure_role_privileges(db, roles_by_name, privileges_by_key)
    _ensure_user_roles(db, roles_by_name)


def main() -> None:
    db = SessionLocal()
    try:
        seed_rbac(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
