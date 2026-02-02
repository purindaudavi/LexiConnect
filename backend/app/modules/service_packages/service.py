from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.lawyer import Lawyer
from app.models.service_package import ServicePackage

def get_lawyer_by_user(db: Session, user_id: int) -> Lawyer:
    lawyer = db.query(Lawyer).filter(Lawyer.user_id == user_id).first()
    if not lawyer:
        raise HTTPException(status_code=400, detail="Lawyer profile not found")
    return lawyer

def create_package(db: Session, lawyer: Lawyer, data):
    pkg = ServicePackage(
        lawyer_id=lawyer.id,
        name=data.name,
        description=data.description,
        price=data.price,
        duration=data.duration,
        active=data.active,
    )
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg

def get_my_packages(db: Session, lawyer: Lawyer):
    return db.query(ServicePackage).filter(ServicePackage.lawyer_id == lawyer.id).order_by(ServicePackage.id.desc()).all()

def update_package(db: Session, pkg: ServicePackage, data):
    for field, value in data.dict(exclude_unset=True).items():
        setattr(pkg, field, value)
    db.commit()
    db.refresh(pkg)
    return pkg

def delete_package(db: Session, pkg: ServicePackage):
    db.delete(pkg)
    db.commit()
