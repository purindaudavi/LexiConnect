from sqlalchemy import Column, Integer, String, ForeignKey
from app.database import Base

class Lawyer(Base):
    __tablename__ = "lawyers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True)
