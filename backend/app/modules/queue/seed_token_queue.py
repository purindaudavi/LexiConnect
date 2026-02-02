"""
Seed script for Token Queue table
Run with: python -m app.modules.queue.seed_token_queue
"""

import sys
import os

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine, Base

# Import all models to ensure they're registered with Base
from app.models.user import User, UserRole
from app.models.branch import Branch
from app.modules.queue.models import QueueEntry, QueueEntryStatus

# Sample client data
SAMPLE_BOOKINGS = [
    {
        "token_number": 1,
        "time": "09:00:00",
        "reason": "Property dispute consultation",
        "status": QueueEntryStatus.completed,
        "client_name": "Rajesh Kumar",
    },
    {
        "token_number": 2,
        "time": "09:30:00",
        "reason": "Business contract review",
        "status": QueueEntryStatus.completed,
        "client_name": "Priya Sharma",
    },
    {
        "token_number": 3,
        "time": "10:00:00",
        "reason": "Family law matters",
        "status": QueueEntryStatus.in_progress,
        "client_name": "Amit Patel",
    },
    {
        "token_number": 4,
        "time": "10:30:00",
        "reason": "Will preparation",
        "status": QueueEntryStatus.confirmed,
        "client_name": "Sunita Verma",
    },
    {
        "token_number": 5,
        "time": "11:00:00",
        "reason": "Criminal case inquiry",
        "status": QueueEntryStatus.pending,
        "client_name": "Vikram Singh",
    },
    {
        "token_number": 6,
        "time": "11:30:00",
        "reason": "Divorce proceedings",
        "status": QueueEntryStatus.pending,
        "client_name": "Meera Reddy",
    },
    {
        "token_number": 7,
        "time": "14:00:00",
        "reason": "IP registration",
        "status": QueueEntryStatus.confirmed,
        "client_name": "Karthik Iyer",
    },
    {
        "token_number": 8,
        "time": "14:30:00",
        "reason": "Employment dispute",
        "status": QueueEntryStatus.pending,
        "client_name": "Ananya Gupta",
    },
    {
        "token_number": 9,
        "time": "15:00:00",
        "reason": "Tenant eviction notice",
        "status": QueueEntryStatus.no_show,
        "client_name": "Ravi Krishnan",
    },
    {
        "token_number": 10,
        "time": "15:30:00",
        "reason": "Partnership agreement",
        "status": QueueEntryStatus.cancelled,
        "client_name": "Neha Agarwal",
    },
]


def seed_token_queue(db: Session):
    """Seed the token_queue table with 10 sample entries for today."""
    
    today = date.today()
    
    # Check if data already exists for today
    existing = db.query(QueueEntry).filter(QueueEntry.date == today).first()
    if existing:
        print(f"Token queue entries already exist for {today}. Deleting old entries...")
        db.query(QueueEntry).filter(QueueEntry.date == today).delete()
        db.commit()
    
    # We need valid lawyer_id and client_id from the users table
    users = db.query(User).limit(5).all()
    if len(users) < 2:
        print("Need at least 2 users in database. Creating default users...")
        
        # Check if admin exists
        admin = db.query(User).filter(User.email == "admin@lexiconnect.com").first()
        if not admin:
            admin = User(
                email="admin@lexiconnect.com",
                full_name="Admin User",
                hashed_password="$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.Gp.u0t1Q1Q1Q1Q",  # placeholder
                role=UserRole.admin,
                is_active=True,
            )
            db.add(admin)
        
        # Check if lawyer exists
        lawyer = db.query(User).filter(User.email == "lawyer@lexiconnect.com").first()
        if not lawyer:
            lawyer = User(
                email="lawyer@lexiconnect.com",
                full_name="Lawyer User",
                hashed_password="$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.Gp.u0t1Q1Q1Q1Q",
                role=UserRole.lawyer,
                is_active=True,
            )
            db.add(lawyer)
        
        # Check if client exists
        client = db.query(User).filter(User.email == "client@lexiconnect.com").first()
        if not client:
            client = User(
                email="client@lexiconnect.com",
                full_name="Client User",
                hashed_password="$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.Gp.u0t1Q1Q1Q1Q",
                role=UserRole.client,
                is_active=True,
            )
            db.add(client)
        
        db.commit()
        users = db.query(User).limit(5).all()
    
    # Get lawyer and client IDs
    lawyer_id = users[0].id if users else 1
    client_id = users[1].id if len(users) > 1 else users[0].id
    
    print(f"Creating 10 token queue entries for {today}...")
    print(f"Using lawyer_id: {lawyer_id}, client_id: {client_id}")
    
    entries_created = 0
    for booking in SAMPLE_BOOKINGS:
        entry = QueueEntry(
            date=today,
            token_number=booking["token_number"],
            time=booking["time"],
            lawyer_id=lawyer_id,
            client_id=client_id,
            reason=booking["reason"],
            status=booking["status"],
            notes=f"Booking for {booking['client_name']}",
            started_at=datetime.utcnow() if booking["status"] in [QueueEntryStatus.in_progress, QueueEntryStatus.completed] else None,
            completed_at=datetime.utcnow() if booking["status"] == QueueEntryStatus.completed else None,
        )
        db.add(entry)
        entries_created += 1
        print(f"  ✓ Token #{booking['token_number']} - {booking['client_name']} ({booking['status'].value})")
    
    db.commit()
    print(f"\n✅ Successfully created {entries_created} token queue entries for {today}")


def main():
    """Main function to run the seed."""
    print("=" * 50)
    print("Token Queue Seeder")
    print("=" * 50)
    
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        seed_token_queue(db)
    except Exception as e:
        print(f"❌ Error seeding token queue: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
