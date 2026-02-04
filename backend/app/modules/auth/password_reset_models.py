from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, text

from app.database import Base


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String(255), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))


Index("ix_password_reset_tokens_user_id", PasswordResetToken.user_id)
Index("ix_password_reset_tokens_token_hash", PasswordResetToken.token_hash, unique=True)
