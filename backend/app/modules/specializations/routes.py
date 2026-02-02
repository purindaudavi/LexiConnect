from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.specializations.schemas import SpecializationOut
from app.modules.specializations.service import list_specializations

router = APIRouter(prefix="/specializations", tags=["Specializations"])


@router.get("/", response_model=List[SpecializationOut])
def get_specializations(db: Session = Depends(get_db)):
    return list_specializations(db)
