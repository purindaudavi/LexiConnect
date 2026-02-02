from app.database import SessionLocal
from app.models.user import User, UserRole
from app.models.lawyer import Lawyer
from app.models.lawyer_availability import WeeklyAvailability
from app.modules.availability.models import AvailabilityTemplate
from app.modules.availability.service import resolve_lawyer_user_id


def run_check(user_id: int = 33) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            print(f"[check] user id={user_id} not found")
            return
        print(f"[check] user id={user.id} role={user.role}")
        if user.role != UserRole.lawyer:
            print("[check] user is not a lawyer; availability checks may be empty")

        lawyer_row = db.query(Lawyer).filter(Lawyer.user_id == user_id).first()
        if lawyer_row:
            mapped_user_id = resolve_lawyer_user_id(db, lawyer_row.id)
            print(f"[check] lawyer row id={lawyer_row.id} user_id={lawyer_row.user_id}")
            print(f"[check] resolve_lawyer_user_id({lawyer_row.id}) -> {mapped_user_id}")
        else:
            print("[check] no lawyer row linked to user_id")

        weekly_count = (
            db.query(WeeklyAvailability)
            .filter(WeeklyAvailability.user_id == user_id)
            .count()
        )
        template_count = (
            db.query(AvailabilityTemplate)
            .filter(AvailabilityTemplate.lawyer_id == user_id)
            .count()
        )

        print(f"[check] weekly_availability rows for user_id={user_id}: {weekly_count}")
        print(f"[check] availability_templates rows for user_id={user_id}: {template_count}")
        if weekly_count == 0 and template_count == 0:
            print("[check] no availability found for this user id")
        else:
            print("[check] availability found for this user id")
    finally:
        db.close()


if __name__ == "__main__":
    run_check()
