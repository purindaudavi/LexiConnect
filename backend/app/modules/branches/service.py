from sqlalchemy.orm import Session
from app.models.branch import Branch


def create_branch(db: Session, user_id: int, data):
    branch = Branch(
        user_id=user_id,
        name=data.name,
        district=data.district,
        city=data.city,
        address=data.address,
    )
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return branch


def get_my_branches(db: Session, user_id: int):
    return db.query(Branch).filter(Branch.user_id == user_id).all()


def update_branch(db: Session, branch: Branch, data):
    for field, value in data.dict(exclude_unset=True).items():
        setattr(branch, field, value)
    db.commit()
    db.refresh(branch)
    return branch


def delete_branch(db: Session, branch: Branch):
    db.delete(branch)
    db.commit()
