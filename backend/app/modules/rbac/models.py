from __future__ import annotations

import enum

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PrivilegeEffect(str, enum.Enum):
    GRANT = "grant"
    DENY = "deny"


class Module(Base):
    __tablename__ = "modules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    privileges: Mapped[list["Privilege"]] = relationship("Privilege", back_populates="module")


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    privileges: Mapped[list["Privilege"]] = relationship(
        "Privilege",
        secondary="role_privileges",
        back_populates="roles",
    )
    users: Mapped[list["User"]] = relationship(
        "User",
        secondary="user_roles",
        back_populates="roles",
    )


class Privilege(Base):
    __tablename__ = "privileges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(150), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    module_id: Mapped[int] = mapped_column(Integer, ForeignKey("modules.id"), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    module: Mapped["Module"] = relationship("Module", back_populates="privileges")
    roles: Mapped[list["Role"]] = relationship(
        "Role",
        secondary="role_privileges",
        back_populates="privileges",
    )


class RolePrivilege(Base):
    __tablename__ = "role_privileges"

    role_id: Mapped[int] = mapped_column(Integer, ForeignKey("roles.id"), primary_key=True)
    privilege_id: Mapped[int] = mapped_column(Integer, ForeignKey("privileges.id"), primary_key=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), primary_key=True)
    role_id: Mapped[int] = mapped_column(Integer, ForeignKey("roles.id"), primary_key=True)
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class UserPrivilegeOverride(Base):
    __tablename__ = "user_privileges"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), primary_key=True)
    privilege_id: Mapped[int] = mapped_column(Integer, ForeignKey("privileges.id"), primary_key=True)
    effect: Mapped[PrivilegeEffect] = mapped_column(
        Enum(PrivilegeEffect, name="privilege_effect"),
        nullable=False,
    )
    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    privilege: Mapped["Privilege"] = relationship("Privilege")
