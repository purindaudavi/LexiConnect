from sqlalchemy import Boolean, Column, DateTime, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class AuthLog(Base):
    __tablename__ = "auth_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    occurred_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    event_type = Column(String(16), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    email = Column(String(255), nullable=True, index=True)
    ip = Column(String(64), nullable=True)
    user_agent = Column(Text, nullable=True)
    success = Column(Boolean, nullable=False, index=True)
    failure_reason = Column(Text, nullable=True)
    method = Column(String(32), nullable=True)
