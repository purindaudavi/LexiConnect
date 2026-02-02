from sqlalchemy import (
    Column,
    Integer,
    DateTime,
    Text,
    ForeignKey,
    UniqueConstraint,
    func,
    String,
)
from app.database import Base


class CaseApprentice(Base):
    __tablename__ = "case_apprentices"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True)
    lawyer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    apprentice_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("case_id", "apprentice_id", name="uq_case_apprentices_case_apprentice"),
    )


class ApprenticeCaseNote(Base):
    __tablename__ = "apprentice_case_notes"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True)

    # OLD column kept for backward compatibility (existing rows)
    apprentice_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # NEW: chat author (lawyer or apprentice)
    author_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    author_role = Column(String(50), nullable=True)

    note = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
