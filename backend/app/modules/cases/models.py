from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship

from app.database import Base

# ✅ IMPORTANT: import the actual mapped class (forces registration)
from app.models.specialization import Specialization


class Case(Base):
    __tablename__ = "cases"

    id = Column(Integer, primary_key=True)

    client_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title = Column(String(200), nullable=False)

    # ✅ keep your legacy string category (so old frontend still works)
    category = Column(String(100), nullable=False)

    # ✅ new controlled dropdown category (FK)
    specialization_id = Column(
        Integer,
        ForeignKey("specializations.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    district = Column(String(100), nullable=False)

    summary_public = Column(Text, nullable=False)
    summary_private = Column(Text, nullable=True)

    status = Column(String(30), nullable=False, server_default="open", index=True)

    selected_lawyer_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    client = relationship("User", foreign_keys=[client_id])
    selected_lawyer = relationship("User", foreign_keys=[selected_lawyer_id])

    # ✅ use class reference (NOT string) so mapper never fails
    specialization = relationship(Specialization, foreign_keys=[specialization_id])

    requests = relationship(
        "CaseRequest",
        back_populates="case",
        cascade="all, delete-orphan",
    )


class CaseRequest(Base):
    __tablename__ = "case_requests"

    id = Column(Integer, primary_key=True)

    case_id = Column(
        Integer,
        ForeignKey("cases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    lawyer_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    message = Column(Text, nullable=True)
    status = Column(String(30), nullable=False, server_default="pending", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    case = relationship("Case", back_populates="requests")
    lawyer = relationship("User", foreign_keys=[lawyer_id])
