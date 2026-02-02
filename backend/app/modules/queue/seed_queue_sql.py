"""
Simple SQL seed script for Token Queue table
Run with: python -m app.modules.queue.seed_queue_sql
"""

import os
import sys
from datetime import date, datetime
from uuid import uuid4

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from sqlalchemy import text
from app.database import engine

# Sample bookings data
SAMPLE_BOOKINGS = [
    {"token": 1, "time": "09:00:00", "reason": "Property dispute consultation", "status": "completed", "name": "Rajesh Kumar"},
    {"token": 2, "time": "09:30:00", "reason": "Business contract review", "status": "completed", "name": "Priya Sharma"},
    {"token": 3, "time": "10:00:00", "reason": "Family law matters", "status": "in_progress", "name": "Amit Patel"},
    {"token": 4, "time": "10:30:00", "reason": "Will preparation", "status": "confirmed", "name": "Sunita Verma"},
    {"token": 5, "time": "11:00:00", "reason": "Criminal case inquiry", "status": "pending", "name": "Vikram Singh"},
    {"token": 6, "time": "11:30:00", "reason": "Divorce proceedings", "status": "pending", "name": "Meera Reddy"},
    {"token": 7, "time": "14:00:00", "reason": "IP registration", "status": "confirmed", "name": "Karthik Iyer"},
    {"token": 8, "time": "14:30:00", "reason": "Employment dispute", "status": "pending", "name": "Ananya Gupta"},
    {"token": 9, "time": "15:00:00", "reason": "Tenant eviction notice", "status": "cancelled", "name": "Ravi Krishnan"},
    {"token": 10, "time": "15:30:00", "reason": "Partnership agreement", "status": "pending", "name": "Neha Agarwal"},
]


def main():
    print("=" * 50)
    print("Token Queue SQL Seeder")
    print("=" * 50)
    
    today = date.today()
    now = datetime.utcnow()
    
    with engine.connect() as conn:
        # First, get a valid lawyer_id and client_id from users table
        result = conn.execute(text("SELECT id FROM users LIMIT 2"))
        users = result.fetchall()
        
        if len(users) < 1:
            print("❌ No users found in database. Please create users first.")
            return
        
        lawyer_id = users[0][0]
        client_id = users[1][0] if len(users) > 1 else users[0][0]
        
        print(f"Using lawyer_id: {lawyer_id}, client_id: {client_id}")
        print(f"Creating entries for date: {today}")
        
        # Delete existing entries for today
        conn.execute(text("DELETE FROM token_queue WHERE date = :today"), {"today": today})
        print("Cleared existing entries for today.")
        
        # Insert new entries
        for booking in SAMPLE_BOOKINGS:
            entry_id = str(uuid4())
            started_at = now if booking["status"] in ["in_progress", "completed"] else None
            completed_at = now if booking["status"] == "completed" else None
            
            conn.execute(
                text("""
                    INSERT INTO token_queue 
                    (id, date, token_number, time, lawyer_id, client_id, reason, notes, status, started_at, completed_at, created_at, updated_at)
                    VALUES 
                    (:id, :date, :token, :time, :lawyer_id, :client_id, :reason, :notes, :status, :started_at, :completed_at, :created_at, :updated_at)
                """),
                {
                    "id": entry_id,
                    "date": today,
                    "token": booking["token"],
                    "time": booking["time"],
                    "lawyer_id": lawyer_id,
                    "client_id": client_id,
                    "reason": booking["reason"],
                    "notes": f"Booking for {booking['name']}",
                    "status": booking["status"],
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "created_at": now,
                    "updated_at": now,
                }
            )
            print(f"  ✓ Token #{booking['token']} - {booking['name']} ({booking['status']})")
        
        conn.commit()
        print(f"\n✅ Successfully created 10 token queue entries for {today}")
        
        # Verify the data
        result = conn.execute(text("SELECT COUNT(*) FROM token_queue WHERE date = :today"), {"today": today})
        count = result.fetchone()[0]
        print(f"📊 Verified: {count} entries in database for today")


if __name__ == "__main__":
    main()
