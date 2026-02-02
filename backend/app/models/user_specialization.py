from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint
from app.database import Base


class UserSpecialization(Base):
    __tablename__ = "user_specializations"
    __table_args__ = (
        UniqueConstraint("user_id", "specialization_id", name="uq_user_specialization"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    specialization_id = Column(Integer, ForeignKey("specializations.id", ondelete="CASCADE"), nullable=False, index=True)
