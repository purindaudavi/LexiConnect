from typing import List

from sqlalchemy.orm import Session

from app.models.specialization import Specialization


def list_specializations(db: Session) -> List[Specialization]:
    return db.query(Specialization).order_by(Specialization.name.asc()).all()
