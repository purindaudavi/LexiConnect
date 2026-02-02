from __future__ import annotations

from typing import Iterable, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.modules.rbac.dependencies import require_privilege
from app.modules.rbac.models import (
    Module as ModuleModel,
    Privilege as PrivilegeModel,
    Role as RoleModel,
    RolePrivilege,
    UserPrivilegeOverride,
    UserRole,
)

router = APIRouter(
    prefix="/api/admin/access-control",
    tags=["Access Control"],
    dependencies=[Depends(require_privilege("access_control.manage"))],
)


class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    page_size: int


class ModuleCreate(BaseModel):
    key: str = Field(..., min_length=2, max_length=100)
    name: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = None
    sort_order: int = 0


class ModuleOut(BaseModel):
    id: int
    key: str
    name: str
    description: Optional[str] = None
    sort_order: int

    class Config:
        from_attributes = True


class PrivilegeCreate(BaseModel):
    key: str = Field(..., min_length=2, max_length=150)
    name: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = None
    module_key: str = Field(..., min_length=2, max_length=100)


class PrivilegeOut(BaseModel):
    id: int
    key: str
    name: str
    description: Optional[str] = None
    module_id: int

    class Config:
        from_attributes = True


class RoleCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    is_system: bool = False


class RoleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    description: Optional[str] = None
    is_system: Optional[bool] = None


class RoleOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    is_system: bool

    class Config:
        from_attributes = True


class RolePrivilegesReplace(BaseModel):
    privilege_keys: List[str] = Field(default_factory=list)


class UserListItem(BaseModel):
    id: int
    full_name: str
    email: str
    role: str

    class Config:
        from_attributes = True


class UserRolesReplace(BaseModel):
    role_names: List[str] = Field(default_factory=list)


class UserPrivilegeOverrideOut(BaseModel):
    privilege_key: str
    effect: str


class UserPrivilegeOverrideReplace(BaseModel):
    grants: List[str] = Field(default_factory=list)
    denies: List[str] = Field(default_factory=list)


def _get_role_by_name(db: Session, name: str) -> RoleModel | None:
    return db.query(RoleModel).filter(func.lower(RoleModel.name) == name.lower()).first()


def _get_privilege_by_key(db: Session, key: str) -> PrivilegeModel | None:
    return db.query(PrivilegeModel).filter(PrivilegeModel.key == key).first()


def _get_module_by_key(db: Session, key: str) -> ModuleModel | None:
    return db.query(ModuleModel).filter(ModuleModel.key == key).first()


def _get_role_privilege_keys(db: Session, role_id: int) -> set[str]:
    stmt = (
        select(PrivilegeModel.key)
        .select_from(RolePrivilege)
        .join(PrivilegeModel, PrivilegeModel.id == RolePrivilege.privilege_id)
        .where(RolePrivilege.role_id == role_id)
    )
    return {row[0] for row in db.execute(stmt).all()}


def _get_user_override_map(db: Session, user_id: int) -> dict[str, str]:
    stmt = (
        select(PrivilegeModel.key, UserPrivilegeOverride.effect)
        .select_from(UserPrivilegeOverride)
        .join(PrivilegeModel, PrivilegeModel.id == UserPrivilegeOverride.privilege_id)
        .where(UserPrivilegeOverride.user_id == user_id)
    )
    return {row[0]: str(row[1]) for row in db.execute(stmt).all()}


def _effective_privileges_for_user(
    db: Session,
    user_id: int,
    role_privilege_overrides: dict[int, set[str]] | None = None,
    override_effects_override: dict[str, str] | None = None,
) -> set[str]:
    role_privilege_overrides = role_privilege_overrides or {}
    override_effects_override = override_effects_override or {}

    role_ids = [
        row[0]
        for row in db.execute(select(UserRole.role_id).where(UserRole.user_id == user_id)).all()
    ]

    privileges: set[str] = set()
    for role_id in role_ids:
        if role_id in role_privilege_overrides:
            privileges.update(role_privilege_overrides[role_id])
        else:
            privileges.update(_get_role_privilege_keys(db, role_id))

    overrides = _get_user_override_map(db, user_id)
    overrides.update(override_effects_override)
    for key, effect in overrides.items():
        if effect == "grant":
            privileges.add(key)
        else:
            privileges.discard(key)
    return privileges


def _admin_user_ids(db: Session) -> list[int]:
    admin_role = _get_role_by_name(db, "ADMIN")
    if not admin_role:
        return []
    stmt = select(UserRole.user_id).where(UserRole.role_id == admin_role.id)
    return [row[0] for row in db.execute(stmt).all()]


def _ensure_not_last_admin_removed(
    db: Session,
    *,
    role_privilege_overrides: dict[int, set[str]] | None = None,
    user_roles_override: dict[int, list[int]] | None = None,
    user_override_effects: dict[int, dict[str, str]] | None = None,
):
    role_privilege_overrides = role_privilege_overrides or {}
    user_roles_override = user_roles_override or {}
    user_override_effects = user_override_effects or {}

    admin_role = _get_role_by_name(db, "ADMIN")
    if not admin_role:
        return

    user_ids = set(_admin_user_ids(db))
    for user_id, role_ids in user_roles_override.items():
        if admin_role.id in role_ids:
            user_ids.add(user_id)
        else:
            user_ids.discard(user_id)

    if not user_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove access_control.manage from the last admin user",
        )

    for user_id in user_ids:
        effective = _effective_privileges_for_user(
            db,
            user_id,
            role_privilege_overrides=role_privilege_overrides,
            override_effects_override=user_override_effects.get(user_id),
        )
        if "access_control.manage" in effective:
            return

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Cannot remove access_control.manage from the last admin user",
    )


@router.get("/modules", response_model=list[ModuleOut])
def list_modules(db: Session = Depends(get_db)):
    return db.query(ModuleModel).order_by(ModuleModel.sort_order.asc(), ModuleModel.key.asc()).all()


@router.post("/modules", response_model=ModuleOut, status_code=status.HTTP_201_CREATED)
def create_module(payload: ModuleCreate, db: Session = Depends(get_db)):
    if _get_module_by_key(db, payload.key):
        raise HTTPException(status_code=400, detail="Module key already exists")
    module = ModuleModel(
        key=payload.key,
        name=payload.name,
        description=payload.description,
        sort_order=payload.sort_order,
    )
    db.add(module)
    db.commit()
    db.refresh(module)
    return module


@router.get("/privileges", response_model=list[PrivilegeOut])
def list_privileges(
    module_key: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    q = db.query(PrivilegeModel)
    if module_key:
        module = _get_module_by_key(db, module_key)
        if not module:
            return []
        q = q.filter(PrivilegeModel.module_id == module.id)
    return q.order_by(PrivilegeModel.key.asc()).all()


@router.post("/privileges", response_model=PrivilegeOut, status_code=status.HTTP_201_CREATED)
def create_privilege(payload: PrivilegeCreate, db: Session = Depends(get_db)):
    if _get_privilege_by_key(db, payload.key):
        raise HTTPException(status_code=400, detail="Privilege key already exists")
    module = _get_module_by_key(db, payload.module_key)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    privilege = PrivilegeModel(
        key=payload.key,
        name=payload.name,
        description=payload.description,
        module_id=module.id,
    )
    db.add(privilege)
    db.commit()
    db.refresh(privilege)
    return privilege


@router.get("/roles", response_model=list[RoleOut])
def list_roles(db: Session = Depends(get_db)):
    return db.query(RoleModel).order_by(RoleModel.name.asc()).all()


@router.post("/roles", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
def create_role(payload: RoleCreate, db: Session = Depends(get_db)):
    if _get_role_by_name(db, payload.name):
        raise HTTPException(status_code=400, detail="Role name already exists")
    role = RoleModel(
        name=payload.name,
        description=payload.description,
        is_system=payload.is_system,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@router.put("/roles/{role_id}", response_model=RoleOut)
def update_role(role_id: int, payload: RoleUpdate, db: Session = Depends(get_db)):
    role = db.query(RoleModel).filter(RoleModel.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if payload.name is not None:
        existing = _get_role_by_name(db, payload.name)
        if existing and existing.id != role.id:
            raise HTTPException(status_code=400, detail="Role name already exists")
        role.name = payload.name
    if payload.description is not None:
        role.description = payload.description
    if payload.is_system is not None:
        role.is_system = payload.is_system
    db.commit()
    db.refresh(role)
    return role


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(role_id: int, db: Session = Depends(get_db)):
    role = db.query(RoleModel).filter(RoleModel.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system:
        raise HTTPException(status_code=400, detail="System roles cannot be deleted")
    db.query(RolePrivilege).filter(RolePrivilege.role_id == role_id).delete()
    db.query(UserRole).filter(UserRole.role_id == role_id).delete()
    db.delete(role)
    db.commit()
    return None


@router.get("/roles/{role_id}/privileges", response_model=list[str])
def get_role_privileges(role_id: int, db: Session = Depends(get_db)):
    role = db.query(RoleModel).filter(RoleModel.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return sorted(_get_role_privilege_keys(db, role_id))


@router.put("/roles/{role_id}/privileges", response_model=list[str])
def replace_role_privileges(role_id: int, payload: RolePrivilegesReplace, db: Session = Depends(get_db)):
    role = db.query(RoleModel).filter(RoleModel.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    desired_keys = list(dict.fromkeys(payload.privilege_keys))
    privileges = db.query(PrivilegeModel).filter(PrivilegeModel.key.in_(desired_keys)).all()
    if len(privileges) != len(desired_keys):
        missing = {k for k in desired_keys} - {p.key for p in privileges}
        raise HTTPException(status_code=400, detail=f"Unknown privilege keys: {', '.join(sorted(missing))}")

    if role.name.upper() == "ADMIN" and "access_control.manage" not in desired_keys:
        _ensure_not_last_admin_removed(
            db,
            role_privilege_overrides={role_id: set(desired_keys)},
        )

    db.query(RolePrivilege).filter(RolePrivilege.role_id == role_id).delete()
    db.add_all(
        [
            RolePrivilege(role_id=role_id, privilege_id=priv.id)
            for priv in privileges
        ]
    )
    db.commit()
    return desired_keys


@router.get("/users", response_model=PaginatedResponse)
def list_users(
    search: Optional[str] = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    q = db.query(User)
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(or_(User.full_name.ilike(like), User.email.ilike(like)))

    total = q.count()
    items = (
        q.order_by(User.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return PaginatedResponse(
        items=[UserListItem.model_validate(u) for u in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/users/{user_id}/roles", response_model=list[str])
def get_user_roles(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    role_ids = [row[0] for row in db.execute(select(UserRole.role_id).where(UserRole.user_id == user_id)).all()]
    if not role_ids:
        return []
    roles = db.query(RoleModel).filter(RoleModel.id.in_(role_ids)).all()
    return sorted([r.name for r in roles])


@router.put("/users/{user_id}/roles", response_model=list[str])
def replace_user_roles(user_id: int, payload: UserRolesReplace, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    desired_roles = list(dict.fromkeys(payload.role_names))
    roles = db.query(RoleModel).filter(RoleModel.name.in_(desired_roles)).all()
    if len(roles) != len(desired_roles):
        missing = {r for r in desired_roles} - {role.name for role in roles}
        raise HTTPException(status_code=400, detail=f"Unknown roles: {', '.join(sorted(missing))}")

    role_ids = [r.id for r in roles]
    _ensure_not_last_admin_removed(
        db,
        user_roles_override={user_id: role_ids},
    )

    db.query(UserRole).filter(UserRole.user_id == user_id).delete()
    db.add_all([UserRole(user_id=user_id, role_id=role_id) for role_id in role_ids])
    db.commit()
    return desired_roles


@router.get("/users/{user_id}/privileges/effective", response_model=list[str])
def get_user_effective_privileges(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    effective = _effective_privileges_for_user(db, user_id)
    return sorted(effective)


@router.get("/users/{user_id}/privileges/overrides", response_model=list[UserPrivilegeOverrideOut])
def get_user_privilege_overrides(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    overrides = _get_user_override_map(db, user_id)
    return [
        UserPrivilegeOverrideOut(privilege_key=key, effect=effect)
        for key, effect in sorted(overrides.items())
    ]


@router.put("/users/{user_id}/privileges/overrides", response_model=list[UserPrivilegeOverrideOut])
def replace_user_privilege_overrides(
    user_id: int,
    payload: UserPrivilegeOverrideReplace,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    grants = list(dict.fromkeys(payload.grants))
    denies = list(dict.fromkeys(payload.denies))
    overlapping = set(grants) & set(denies)
    if overlapping:
        raise HTTPException(status_code=400, detail="Privilege keys cannot be both granted and denied")

    keys = list(set(grants + denies))
    if keys:
        privs = db.query(PrivilegeModel).filter(PrivilegeModel.key.in_(keys)).all()
        if len(privs) != len(keys):
            missing = {k for k in keys} - {p.key for p in privs}
            raise HTTPException(status_code=400, detail=f"Unknown privilege keys: {', '.join(sorted(missing))}")

    override_map = {key: "grant" for key in grants}
    override_map.update({key: "deny" for key in denies})

    if "access_control.manage" in override_map:
        _ensure_not_last_admin_removed(
            db,
            user_override_effects={user_id: override_map},
        )

    db.query(UserPrivilegeOverride).filter(UserPrivilegeOverride.user_id == user_id).delete()
    if override_map:
        key_to_priv = {
            p.key: p
            for p in db.query(PrivilegeModel).filter(PrivilegeModel.key.in_(list(override_map.keys()))).all()
        }
        db.add_all(
            [
                UserPrivilegeOverride(
                    user_id=user_id,
                    privilege_id=key_to_priv[key].id,
                    effect=override_map[key],
                )
                for key in override_map
            ]
        )
    db.commit()

    return [
        UserPrivilegeOverrideOut(privilege_key=key, effect=effect)
        for key, effect in sorted(override_map.items())
    ]
