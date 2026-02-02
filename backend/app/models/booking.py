from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.database import Base


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    lawyer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=True, index=True)
    service_package_id = Column(Integer, ForeignKey("service_packages.id"), nullable=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=True, index=True)
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    ends_at = Column(DateTime(timezone=True), nullable=True, index=True)
    note = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="pending")
    blocks_time = Column(Boolean, nullable=False, default=True, server_default="true", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    client = relationship("User", foreign_keys=[client_id], back_populates="bookings")
    lawyer = relationship("User", foreign_keys=[lawyer_id])
    branch = relationship("Branch", foreign_keys=[branch_id])
    service_package = relationship("ServicePackage", foreign_keys=[service_package_id])
    case = relationship("Case", foreign_keys=[case_id])
