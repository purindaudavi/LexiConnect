from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.service_package import ServicePackage

from app.modules.service_packages.schemas import (
    ServicePackageCreate,
    ServicePackageUpdate,
    ServicePackageResponse,
)
from app.modules.service_packages import service

router = APIRouter(prefix="/api/service-packages", tags=["Service Packages"])

@router.post("", response_model=ServicePackageResponse, status_code=status.HTTP_201_CREATED)
def create_service_package(
    payload: ServicePackageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "lawyer":
        raise HTTPException(status_code=403, detail="Only lawyers can create service packages")
    lawyer = service.get_lawyer_by_user(db, current_user.id)
    return service.create_package(db, lawyer, payload)

@router.get("/me", response_model=List[ServicePackageResponse])
def get_my_service_packages(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "lawyer":
        raise HTTPException(status_code=403, detail="Only lawyers can view service packages")
    lawyer = service.get_lawyer_by_user(db, current_user.id)
    return service.get_my_packages(db, lawyer)

@router.patch("/{package_id}", response_model=ServicePackageResponse)
def update_service_package(
    package_id: int,
    payload: ServicePackageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lawyer = service.get_lawyer_by_user(db, current_user.id)
    pkg = db.query(ServicePackage).filter(ServicePackage.id == package_id, ServicePackage.lawyer_id == lawyer.id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Service package not found")
    return service.update_package(db, pkg, payload)

@router.delete("/{package_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service_package(
    package_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lawyer = service.get_lawyer_by_user(db, current_user.id)
    pkg = db.query(ServicePackage).filter(ServicePackage.id == package_id, ServicePackage.lawyer_id == lawyer.id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="Service package not found")
    service.delete_package(db, pkg)
