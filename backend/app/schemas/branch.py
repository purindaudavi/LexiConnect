from pydantic import BaseModel

class BranchBase(BaseModel):
    name: str
    district: str
    city: str
    address: str

class BranchCreate(BranchBase):
    pass

class Branch(BranchBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True
