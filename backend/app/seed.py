"""
Seed demo data for development.

Runs only when environment variables are enabled.

- SEED_DEMO_USERS=true
- SEED_DEMO_DISPUTES=true

Never overwrites existing data.
"""

import os
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.models.lawyer import Lawyer
from app.models.branch import Branch
from app.routers.auth import get_password_hash, get_user_by_email

# ✅ Correct imports based on your project structure
from app.modules.disputes.models import Dispute
from app.models.booking import Booking
from app.scripts.seed_rbac import seed_rbac


def _is_true(name: str) -> bool:
    return os.getenv(name, "").lower() == "true"


# ======================================================
# USERS
# ======================================================
def seed_demo_users(db: Session):
    if not _is_true("SEED_DEMO_USERS"):
        return

    users = [
        {
            "email": os.getenv("ADMIN_EMAIL", "admin@lexiconnect.local"),
            "password": os.getenv("ADMIN_PASSWORD", "Admin@123"),
            "role": UserRole.admin,
            "full_name": "Admin User",
        },
        {
            "email": os.getenv("LAWYER_EMAIL", "lawyer@lexiconnect.local"),
            "password": os.getenv("LAWYER_PASSWORD", "Lawyer@123"),
            "role": UserRole.lawyer,
            "full_name": "Lawyer User",
        },
        {
            "email": os.getenv("CLIENT_EMAIL", "client@lexiconnect.local"),
            "password": os.getenv("CLIENT_PASSWORD", "Client@123"),
            "role": UserRole.client,
            "full_name": "Client User",
        },
        # ✅ NEW: Apprentice user
        {
            "email": os.getenv("APPRENTICE_EMAIL", "apprentice@lexiconnect.local"),
            "password": os.getenv("APPRENTICE_PASSWORD", "Apprentice@123"),
            "role": UserRole.apprentice,
            "full_name": "Apprentice User",
        },
    ]

    created = 0
    skipped = 0

    for u in users:
        # Safety: skip if env accidentally missing
        if not u["email"] or not u["password"]:
            skipped += 1
            continue

        if get_user_by_email(db, u["email"]):
            skipped += 1
            continue

        db.add(
            User(
                full_name=u["full_name"],
                email=u["email"],
                phone=None,
                hashed_password=get_password_hash(u["password"]),
                role=u["role"],
            )
        )
        created += 1

    if created:
        db.commit()

    # Create corresponding Lawyer records for lawyer users
    seed_lawyer_records(db)

    print(f"[SEED] Users -> created={created}, skipped={skipped}")


def seed_lawyer_records(db: Session):
    """
    Create Lawyer records for users with lawyer role.

    NOTE: This does NOT rely on a User.lawyer relationship (avoids mapper errors).
    It links by email/name only.
    """
    lawyer_users = db.query(User).filter(User.role == UserRole.lawyer).all()

    created = 0
    skipped = 0

    for user in lawyer_users:
        existing_lawyer = db.query(Lawyer).filter(Lawyer.email == user.email).first()
        if existing_lawyer:
            skipped += 1
            continue

        lawyer = Lawyer(
            user_id=user.id,
            name=user.full_name,
            email=user.email,
        )
        db.add(lawyer)
        created += 1

    if created:
        db.commit()

    print(f"[SEED] Lawyer records -> created={created}, skipped={skipped}")


def _pick_seed_lawyer(db: Session) -> Lawyer | None:
    preferred_email = os.getenv("LAWYER_EMAIL", "lawyer@lexiconnect.local")
    lawyer = db.query(Lawyer).filter(Lawyer.email == preferred_email).first()
    if lawyer:
        return lawyer
    return db.query(Lawyer).order_by(Lawyer.id.asc()).first()


def seed_demo_branches(db: Session):
    """
    Seed a few branches for the default lawyer so availability has real locations.
    Runs when SEED_DEMO_BRANCHES=true or SEED_DEMO_USERS=true.
    """
    should_seed = _is_true("SEED_DEMO_BRANCHES") or _is_true("SEED_DEMO_USERS")
    if not should_seed:
        return

    lawyer = _pick_seed_lawyer(db)
    if not lawyer:
        print("[SEED] Branches skipped — no lawyers found")
        return

    templates = [
        {
            "name": "Firm Office - Colombo",
            "district": "Western",
            "city": "Colombo",
            "address": "Main office in the city center",
        },
        {
            "name": "Home Office - Dehiwala",
            "district": "Western",
            "city": "Dehiwala",
            "address": "Convenient suburban location",
        },
        {
            "name": "Online Consultation",
            "district": "Online",
            "city": "Remote",
            "address": "Zoom/Teams",
        },
    ]

    created = 0
    skipped = 0

    for template in templates:
        exists = (
            db.query(Branch)
            .filter(Branch.user_id == lawyer.user_id, Branch.name == template["name"])
            .first()
        )
        if exists:
            skipped += 1
            continue

        db.add(
            Branch(
                user_id=lawyer.user_id,
                name=template["name"],
                district=template["district"],
                city=template["city"],
                address=template["address"],
            )
        )
        created += 1

    if created:
        db.commit()

    print(
        f"[SEED] Branches -> created={created}, skipped={skipped} for user_id={lawyer.user_id}"
    )


# ======================================================
# DISPUTES
# ======================================================
def seed_demo_disputes(db: Session):
    if not _is_true("SEED_DEMO_DISPUTES"):
        return

    client_email = os.getenv("CLIENT_EMAIL", "client@lexiconnect.local")
    client = get_user_by_email(db, client_email)

    if not client:
        print("[SEED] Disputes skipped — client user not found")
        return

    # Get latest booking if exists (safe)
    latest_booking = (
        db.query(Booking)
        .filter(Booking.client_id == client.id)
        .order_by(Booking.id.desc())
        .first()
    )

    booking_id = latest_booking.id if latest_booking else None

    disputes = [
        {
            "title": "Lawyer did not respond",
            "description": "No response from lawyer after booking confirmation.",
        },
        {
            "title": "Appointment rescheduled without notice",
            "description": "Meeting time changed without informing the client.",
        },
        {
            "title": "Billing issue",
            "description": "Charged amount does not match agreed package.",
        },
    ]

    created = 0
    skipped = 0

    for d in disputes:
        exists = (
            db.query(Dispute)
            .filter(
                Dispute.client_id == client.id,
                Dispute.title == d["title"],
            )
            .first()
        )

        if exists:
            skipped += 1
            continue

        db.add(
            Dispute(
                client_id=client.id,
                booking_id=booking_id,
                title=d["title"],
                description=d["description"],
                status="PENDING",
            )
        )
        created += 1

    if created:
        db.commit()

    print(f"[SEED] Disputes -> created={created}, skipped={skipped}")


# ======================================================
# ENTRY POINT
# ======================================================
def seed_all(db: Session):
    seed_rbac(db)
    seed_demo_users(db)
    seed_demo_branches(db)
    seed_demo_disputes(db)
