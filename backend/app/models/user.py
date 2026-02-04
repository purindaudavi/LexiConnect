from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Integer,
    String,
    func,
    text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class UserRole(str, Enum):
    client = "client"
    lawyer = "lawyer"
    admin = "admin"
    apprentice = "apprentice"  # ✅ add this


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    phone = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.client)
    nic = Column(String(20), nullable=True)
    must_change_password = Column(
        Boolean,
        nullable=False,
        server_default=text("false"),
        default=False,
    )
    created_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    bookings = relationship(
        "Booking",
        back_populates="client",
        cascade="all, delete-orphan",
        foreign_keys="Booking.client_id",
    )

    roles = relationship(
        "Role",
        secondary="user_roles",
        back_populates="users",
    )

    created_by_user = relationship(
        "User",
        remote_side=[id],
        foreign_keys=[created_by_user_id],
    )

    
