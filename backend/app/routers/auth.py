from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.lawyer import Lawyer
from app.models.kyc_submission import KYCSubmission
from app.models.lawyer_kyc import LawyerKYC, KYCStatus
from app.modules.lawyer_profiles.models import LawyerProfile
from app.schemas.auth import Token
from app.schemas.user import UserCreate, UserOut
from app.schemas.user_public import UserMeOut
from app.modules.rbac.models import Role as RoleModel, UserRole as UserRoleModel
from app.modules.rbac.services import get_user_effective_privilege_keys

router = APIRouter(prefix="/auth", tags=["auth"])

# ✅ Move to env in production
SECRET_KEY = "CHANGE_ME_SECRET_KEY"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", scheme_name="BearerAuth")


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    user = get_user_by_email(db, email)
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user


def _create_token(data: dict, expires_delta: timedelta, token_type: str) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire, "type": token_type})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    expire = expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return _create_token(data, expire, "access")


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    expire = expires_delta or timedelta(minutes=REFRESH_TOKEN_EXPIRE_MINUTES)
    return _create_token(data, expire, "refresh")


def _decode_token(token: str, expected_type: str) -> dict:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    token_type = payload.get("type")
    if token_type != expected_type:
        raise JWTError(f"Invalid token type: expected {expected_type}, got {token_type}")
    return payload


def _get_user_from_payload(payload: dict, db: Session) -> User:
    user_id = payload.get("sub")
    if user_id is None:
        raise JWTError("Missing sub claim")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise JWTError("User not found")
    return user


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = _decode_token(token, "access")
        user = _get_user_from_payload(payload, db)
    except JWTError:
        raise credentials_exception
    return user


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    existing = get_user_by_email(db, user_in.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    hashed_password = get_password_hash(user_in.password)

    user = User(
        full_name=user_in.full_name,
        email=user_in.email,
        phone=user_in.phone,
        hashed_password=hashed_password,
        role=user_in.role or UserRole.client,
    )

    try:
        db.add(user)
        db.flush()

        if user.role == UserRole.lawyer:
            lawyer_row = db.query(Lawyer).filter(Lawyer.email == user.email).first()
            if not lawyer_row:
                lawyer_row = Lawyer(name=user.full_name, email=user.email)
                db.add(lawyer_row)
                db.flush()

            profile_row = db.query(LawyerProfile).filter(LawyerProfile.user_id == user.id).first()
            if not profile_row:
                languages = user_in.languages
                if isinstance(languages, str):
                    languages = [item.strip() for item in languages.split(",") if item.strip()]

                profile_row = LawyerProfile(
                    user_id=user.id,
                    district=user_in.district or None,
                    city=user_in.city or None,
                    specialization=user_in.specialization or None,
                    languages=languages or None,
                    years_of_experience=user_in.years_of_experience,
                    bio=user_in.bio or None,
                    rating=0.0,
                    is_verified=False,
                )
                db.add(profile_row)

            kyc_existing = (
                db.query(KYCSubmission)
                .filter(KYCSubmission.lawyer_id == lawyer_row.id)
                .first()
            )
            if not kyc_existing:
                kyc = KYCSubmission(
                    lawyer_id=lawyer_row.id,
                    full_name=user.full_name,
                    nic_number="pending",
                    bar_council_id="pending",
                    address="pending",
                    contact_number=user.phone or "pending",
                    bar_certificate_url=None,
                    status="pending",
                )
                db.add(kyc)

            legacy_kyc = (
                db.query(LawyerKYC)
                .filter(LawyerKYC.user_id == user.id)
                .first()
            )
            if not legacy_kyc:
                legacy_kyc = LawyerKYC(
                    user_id=user.id,
                    nic_number="pending",
                    bar_association_id="pending",
                    bar_certificate_path=None,
                    status=KYCStatus.PENDING,
                )
                db.add(legacy_kyc)

        db.commit()
        db.refresh(user)
        return user
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed creating user records: {e}")



@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # OAuth2PasswordRequestForm uses 'username' field, but we use it as email
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    # ✅ Store role as string in JWT to avoid enum serialization issues
    base_claims = {"sub": str(user.id), "role": user.role.value}

    access_token = create_access_token(
        data=base_claims,
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    refresh_token = create_refresh_token(
        data=base_claims,
        expires_delta=timedelta(minutes=REFRESH_TOKEN_EXPIRE_MINUTES),
    )

    return Token(access_token=access_token, refresh_token=refresh_token, token_type="bearer")


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh", response_model=Token)
def refresh_token(payload: RefreshRequest, db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        decoded = _decode_token(payload.refresh_token, "refresh")
        user = _get_user_from_payload(decoded, db)
    except JWTError:
        raise credentials_exception

    base_claims = {"sub": str(user.id), "role": user.role.value}
    new_access = create_access_token(base_claims)
    new_refresh = create_refresh_token(base_claims)

    return Token(access_token=new_access, refresh_token=new_refresh, token_type="bearer")


@router.get("/me", response_model=UserMeOut)
def get_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role_rows = (
        db.query(RoleModel)
        .join(UserRoleModel, UserRoleModel.role_id == RoleModel.id)
        .filter(UserRoleModel.user_id == current_user.id)
        .order_by(RoleModel.name.asc())
        .all()
    )
    roles = [r.name for r in role_rows]
    privileges = sorted(get_user_effective_privilege_keys(db, current_user.id))
    return UserMeOut(
        id=current_user.id,
        full_name=current_user.full_name,
        email=current_user.email,
        role=current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
        roles=roles,
        effective_privileges=privileges,
        created_at=current_user.created_at,
    )


# ============================================================================
# TEMPORARY DEV ENDPOINT - DELETE BEFORE PRODUCTION
# ============================================================================
@router.post("/dev/create-admin")
def create_admin_user(db: Session = Depends(get_db)):
    admin_email = "admin@lexiconnect.com"

    existing = get_user_by_email(db, admin_email)
    if existing:
        return {"message": "Admin user already exists", "email": admin_email}

    hashed_password = get_password_hash("admin123")
    admin_user = User(
        email=admin_email,
        full_name="System Admin",
        hashed_password=hashed_password,
        role=UserRole.admin,
        phone=None,
    )
    db.add(admin_user)
    db.commit()
    db.refresh(admin_user)

    return {
        "message": "Admin user created successfully",
        "email": admin_email,
        "password": "admin123",
        "role": "admin",
    }
