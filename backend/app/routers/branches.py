from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.branch import Branch as BranchModel
from ..schemas.branch import BranchCreate, Branch as BranchSchema

router = APIRouter(prefix="/branches", tags=["Branches"])

fake_user_id = 1  # Temporary until authentication is added


@router.post("/", response_model=BranchSchema)
def create_branch(data: BranchCreate, db: Session = Depends(get_db)):
    new_branch = BranchModel(
        user_id=fake_user_id,
        name=data.name,
        district=data.district,
        city=data.city,
        address=data.address
    )

    db.add(new_branch)
    db.commit()
    db.refresh(new_branch)

    return new_branch


@router.get("/", response_model=list[BranchSchema])
def get_branches(lawyer_id: int | None = None, db: Session = Depends(get_db)):
    # If no lawyer_id provided, use logged-in lawyer
    if lawyer_id is None:
        lawyer_id = fake_user_id

    branches = (
        db.query(BranchModel)
        .filter(BranchModel.user_id == lawyer_id)
        .all()
    )

    return branches
