from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.auth.deps import get_current_user
from app.models.lawyer import Lawyer
from app.models.user import User


def get_current_lawyer(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Lawyer:
    lawyer = db.query(Lawyer).filter(Lawyer.user_id == current_user.id).first()

    if not lawyer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Lawyer profile not linked to this account. Contact admin / complete setup.",
        )

    return lawyer
