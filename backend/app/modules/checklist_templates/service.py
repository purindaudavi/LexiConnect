from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.lawyer import Lawyer
from app.models.checklist_template import ChecklistTemplate


def get_lawyer_by_user(db: Session, user_id: int) -> Lawyer:
    lawyer = db.query(Lawyer).filter(Lawyer.user_id == user_id).first()
    if not lawyer:
        raise HTTPException(status_code=400, detail="Lawyer profile not found")
    return lawyer


def create_template(db: Session, lawyer: Lawyer, data):
    template = ChecklistTemplate(
        lawyer_id=lawyer.id,
        question=data.question,
        helper_text=data.helper_text,
        required=data.required,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def get_my_templates(db: Session, lawyer: Lawyer):
    return (
        db.query(ChecklistTemplate)
        .filter(ChecklistTemplate.lawyer_id == lawyer.id)
        .order_by(ChecklistTemplate.id.desc())
        .all()
    )


def update_template(db: Session, template: ChecklistTemplate, data):
    for field, value in data.dict(exclude_unset=True).items():
        setattr(template, field, value)
    db.commit()
    db.refresh(template)
    return template


def delete_template(db: Session, template: ChecklistTemplate):
    db.delete(template)
    db.commit()
