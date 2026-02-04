from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.modules.auth.password_reset_models import PasswordResetToken


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def create_password_reset_token(
    user_id: int,
    db: Optional[Session] = None,
) -> Tuple[str, datetime]:
    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)

    owns_session = db is None
    if db is None:
        db = SessionLocal()
    try:
        token_row = PasswordResetToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        db.add(token_row)
        db.commit()
        return raw_token, expires_at
    finally:
        if owns_session:
            db.close()


def consume_password_reset_token(
    raw_token: str,
    db: Optional[Session] = None,
) -> int:
    token_hash = _hash_token(raw_token)
    now = datetime.now(timezone.utc)

    owns_session = db is None
    if db is None:
        db = SessionLocal()
    try:
        token_row = (
            db.query(PasswordResetToken)
            .filter(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.used_at.is_(None),
                PasswordResetToken.expires_at > now,
            )
            .first()
        )
        if not token_row:
            raise ValueError("Invalid or expired password reset token")

        token_row.used_at = now
        db.commit()
        return token_row.user_id
    finally:
        if owns_session:
            db.close()
