from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.modules.cases.models import Case, CaseRequest
from app.models.specialization import Specialization


def create_case(db: Session, client: User, data) -> Case:
    specialization = (
        db.query(Specialization)
        .filter(Specialization.id == data.specialization_id)
        .first()
    )
    if not specialization:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Specialization not found")
    case = Case(
        client_id=client.id,
        title=data.title,
        category=specialization.name,
        specialization_id=specialization.id,
        district=data.district,
        summary_public=data.summary_public,
        summary_private=data.summary_private,
        status="open",
    )

    db.add(case)
    db.commit()
    db.refresh(case)
    return case


def list_client_cases(db: Session, client: User) -> List[Case]:
    return (
        db.query(Case)
        .filter(Case.client_id == client.id)
        .order_by(Case.created_at.desc())
        .all()
    )


def get_case(db: Session, case_id: int) -> Optional[Case]:
    return db.query(Case).filter(Case.id == case_id).first()


def list_requests_for_case(db: Session, case_id: int) -> List[CaseRequest]:
    return (
        db.query(CaseRequest)
        .filter(CaseRequest.case_id == case_id)
        .order_by(CaseRequest.created_at.desc())
        .all()
    )


def list_requests_for_lawyer(db: Session, lawyer: User) -> List[CaseRequest]:
    return (
        db.query(CaseRequest)
        .filter(CaseRequest.lawyer_id == lawyer.id)
        .order_by(CaseRequest.created_at.desc())
        .all()
    )


def create_request(db: Session, lawyer: User, case: Case, message: Optional[str]) -> CaseRequest:
    existing = (
        db.query(CaseRequest)
        .filter(CaseRequest.case_id == case.id, CaseRequest.lawyer_id == lawyer.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request already submitted")
    req = CaseRequest(case_id=case.id, lawyer_id=lawyer.id, message=message, status="pending")
    db.add(req)
    db.commit()
    db.refresh(req)
    return req
