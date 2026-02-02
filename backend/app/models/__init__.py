from app.models.appointment import Appointment
from app.models.availability import AvailabilitySlot
from app.models.booking import Booking
from app.models.branch import Branch

# Document model intentionally disabled (file does not exist)
# from app.models.document import Document

from app.models.kyc_submission import KYCSubmission
from app.models.lawyer import Lawyer
from app.models.lawyer_kyc import LawyerKYC
from app.models.user import User

# Service packages
from . import service_package

# Case-related models (needed for Alembic discovery)
from app.modules.cases import models as case_models  # noqa: F401

# RBAC models
from app.modules.rbac.models import (
    Module,
    Privilege,
    Role,
    RolePrivilege,
    UserPrivilegeOverride,
    UserRole,
)
