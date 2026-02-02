"""
Script to update token_queue_status enum and seed data
Links token queue entries with weekly availability slots
"""
from sqlalchemy import text
from app.database import engine
from datetime import date, datetime
from uuid import uuid4
import bcrypt

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def main():
    print("=" * 50)
    print("Token Queue Setup Script")
    print("=" * 50)
    
    conn = engine.connect()
    
    # Step 1: Add missing enum values
    print("\n📋 Step 1: Adding missing enum values...")
    enum_values = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']
    
    for value in enum_values:
        try:
            conn.execute(text(f"ALTER TYPE token_queue_status ADD VALUE IF NOT EXISTS '{value}'"))
            print(f"  ✓ Added enum value: {value}")
        except Exception as e:
            print(f"  - {value}: {e}")
    
    conn.commit()
    
    # Verify enum values
    r = conn.execute(text("SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'token_queue_status')"))
    current_values = [x[0] for x in r.fetchall()]
    print(f"\n  Current enum values: {current_values}")
    
    # Step 2: Get lawyer user ID and branch ID
    print("\n📋 Step 2: Getting lawyer and branch info...")
    r = conn.execute(text("SELECT id FROM lawyers LIMIT 1"))
    lawyer_row = r.fetchone()
    
    if not lawyer_row:
        print("  ❌ No lawyer found. Cannot seed data.")
        return
    
    lawyer_id = lawyer_row[0]
    print(f"  Using lawyer_id: {lawyer_id}")
    
    # Get a branch for this lawyer
    r = conn.execute(text("SELECT id, name FROM branches WHERE lawyer_id = :lid LIMIT 1"), {"lid": lawyer_id})
    branch_row = r.fetchone()
    if not branch_row:
        print("  ❌ No branch found for lawyer. Cannot seed data.")
        return
    
    branch_id = branch_row[0]
    branch_name = branch_row[1]
    print(f"  Using branch_id: {branch_id} ({branch_name})")
    
    # Step 3: Create/update Friday availability slots
    print("\n📋 Step 3: Setting up Friday availability slots...")
    today = date.today()
    day_of_week = today.strftime("%A").upper()  # e.g., "FRIDAY"
    print(f"  Today ({today}) is a {day_of_week}")
    
    # Check if slots exist for today's day of week
    r = conn.execute(text("""
        SELECT id, start_time, end_time, max_bookings FROM weekly_availability 
        WHERE lawyer_id = :lid AND day_of_week = :dow AND is_active = true
        ORDER BY start_time
    """), {"lid": lawyer_id, "dow": day_of_week})
    existing_slots = r.fetchall()
    
    if existing_slots:
        print(f"  Found {len(existing_slots)} existing {day_of_week} slots")
        for s in existing_slots:
            print(f"    - Slot ID {s[0]}: {s[1]} - {s[2]} (max {s[3]})")
    else:
        print(f"  No {day_of_week} slots found. Creating new slots...")
        
        # Create Friday slots: Morning (09:00-12:00) and Afternoon (14:00-17:00)
        friday_slots = [
            {"start": "09:00:00", "end": "12:00:00", "max": 5, "loc": f"{branch_name} - Morning Session"},
            {"start": "14:00:00", "end": "17:00:00", "max": 5, "loc": f"{branch_name} - Afternoon Session"},
        ]
        
        for slot in friday_slots:
            conn.execute(text("""
                INSERT INTO weekly_availability 
                (lawyer_id, branch_id, day_of_week, start_time, end_time, max_bookings, location, is_active, created_at, updated_at)
                VALUES (:lid, :bid, :dow, :start, :end, :max, :loc, true, NOW(), NOW())
            """), {
                "lid": lawyer_id, "bid": branch_id, "dow": day_of_week,
                "start": slot["start"], "end": slot["end"], 
                "max": slot["max"], "loc": slot["loc"]
            })
            print(f"    ✓ Created slot: {slot['start']} - {slot['end']}")
        
        conn.commit()
        
        # Re-fetch slots
        r = conn.execute(text("""
            SELECT id, start_time, end_time, max_bookings FROM weekly_availability 
            WHERE lawyer_id = :lid AND day_of_week = :dow AND is_active = true
            ORDER BY start_time
        """), {"lid": lawyer_id, "dow": day_of_week})
        existing_slots = r.fetchall()
    
    # Step 4: Create client users if they don't exist
    print("\n📋 Step 4: Creating client users...")
    
    clients = [
        {"name": "Rajesh Kumar", "email": "rajesh.kumar@example.com", "phone": "9876543210"},
        {"name": "Priya Sharma", "email": "priya.sharma@example.com", "phone": "9876543211"},
        {"name": "Amit Patel", "email": "amit.patel@example.com", "phone": "9876543212"},
        {"name": "Sunita Verma", "email": "sunita.verma@example.com", "phone": "9876543213"},
        {"name": "Vikram Singh", "email": "vikram.singh@example.com", "phone": "9876543214"},
        {"name": "Meera Reddy", "email": "meera.reddy@example.com", "phone": "9876543215"},
        {"name": "Karthik Iyer", "email": "karthik.iyer@example.com", "phone": "9876543216"},
        {"name": "Ananya Gupta", "email": "ananya.gupta@example.com", "phone": "9876543217"},
        {"name": "Ravi Krishnan", "email": "ravi.krishnan@example.com", "phone": "9876543218"},
        {"name": "Neha Agarwal", "email": "neha.agarwal@example.com", "phone": "9876543219"},
    ]
    
    client_ids = []
    hashed_pw = hash_password("password123")
    
    for client in clients:
        # Check if user exists
        r = conn.execute(text("SELECT id FROM users WHERE email = :email"), {"email": client["email"]})
        existing = r.fetchone()
        
        if existing:
            client_ids.append(existing[0])
            print(f"  - {client['name']} already exists (id={existing[0]})")
        else:
            conn.execute(
                text("""
                    INSERT INTO users (full_name, email, phone, hashed_password, role, created_at)
                    VALUES (:name, :email, :phone, :password, 'client', NOW())
                """),
                {"name": client["name"], "email": client["email"], "phone": client["phone"], "password": hashed_pw}
            )
            conn.commit()
            r = conn.execute(text("SELECT id FROM users WHERE email = :email"), {"email": client["email"]})
            new_id = r.fetchone()[0]
            client_ids.append(new_id)
            print(f"  ✓ Created {client['name']} (id={new_id})")
    
    # Step 5: Seed token queue data linked to availability slots
    print("\n📋 Step 5: Seeding token queue data...")
    now = datetime.utcnow()
    
    # Delete existing entries for today
    conn.execute(text("DELETE FROM token_queue WHERE date = :today"), {"today": today})
    print(f"  Cleared existing entries for {today}")
    
    # Get the user_id for the lawyer from users table (token_queue.lawyer_id refs users.id)
    r = conn.execute(text("SELECT id FROM users WHERE role = 'lawyer' LIMIT 1"))
    lawyer_user_row = r.fetchone()
    if not lawyer_user_row:
        print("  ❌ No lawyer user found. Cannot seed data.")
        return
    lawyer_user_id = lawyer_user_row[0]
    print(f"  Using lawyer_user_id: {lawyer_user_id} for token_queue entries")
    
    # Create bookings that align with the availability slots
    # Morning slot: 09:00-12:00 -> tokens at 09:00, 09:30, 10:00, 10:30, 11:00, 11:30
    # Afternoon slot: 14:00-17:00 -> tokens at 14:00, 14:30, 15:00, 15:30
    bookings = [
        # Morning session tokens (within 09:00-12:00)
        {"token": 1, "time": "09:00:00", "reason": "Property dispute consultation", "status": "completed"},
        {"token": 2, "time": "09:30:00", "reason": "Business contract review", "status": "completed"},
        {"token": 3, "time": "10:00:00", "reason": "Family law matters", "status": "in_progress"},
        {"token": 4, "time": "10:30:00", "reason": "Will preparation", "status": "confirmed"},
        {"token": 5, "time": "11:00:00", "reason": "Criminal case inquiry", "status": "pending"},
        {"token": 6, "time": "11:30:00", "reason": "Divorce proceedings", "status": "pending"},
        # Afternoon session tokens (within 14:00-17:00)
        {"token": 7, "time": "14:00:00", "reason": "IP registration", "status": "confirmed"},
        {"token": 8, "time": "14:30:00", "reason": "Employment dispute", "status": "pending"},
        {"token": 9, "time": "15:00:00", "reason": "Tenant eviction notice", "status": "no_show"},
        {"token": 10, "time": "15:30:00", "reason": "Partnership agreement", "status": "cancelled"},
    ]
    
    for i, booking in enumerate(bookings):
        entry_id = str(uuid4())
        client_id = client_ids[i]
        started_at = now if booking["status"] in ["in_progress", "completed"] else None
        completed_at = now if booking["status"] == "completed" else None
        
        conn.execute(
            text("""
                INSERT INTO token_queue 
                (id, date, token_number, time, lawyer_id, client_id, branch_id, reason, notes, status, started_at, completed_at, created_at, updated_at)
                VALUES 
                (:id, :date, :token, :time, :lawyer_id, :client_id, :branch_id, :reason, :notes, CAST(:status AS token_queue_status), :started_at, :completed_at, :created_at, :updated_at)
            """),
            {
                "id": entry_id,
                "date": today,
                "token": booking["token"],
                "time": booking["time"],
                "lawyer_id": lawyer_user_id,
                "client_id": client_id,
                "branch_id": branch_id,
                "reason": booking["reason"],
                "notes": f"Token booking",
                "status": booking["status"],
                "started_at": started_at,
                "completed_at": completed_at,
                "created_at": now,
                "updated_at": now,
            }
        )
        print(f"  ✓ Token #{booking['token']} at {booking['time']} ({booking['status']})")
    
    conn.commit()
    
    # Verify
    r = conn.execute(text("SELECT COUNT(*) FROM token_queue WHERE date = :today"), {"today": today})
    count = r.fetchone()[0]
    print(f"\n✅ Successfully created {count} token queue entries for {today}")
    
    # Show entries with client names
    print("\n📋 Token Queue for Today:")
    print("-" * 70)
    r = conn.execute(text("""
        SELECT tq.token_number, u.full_name, tq.status, tq.time, tq.reason
        FROM token_queue tq
        JOIN users u ON u.id = tq.client_id
        WHERE tq.date = :today
        ORDER BY tq.token_number
    """), {"today": today})
    
    for row in r.fetchall():
        print(f"  #{row[0]:2d} | {row[3]} | {row[1]:15s} | {row[2]:12s} | {row[4]}")
    
    # Show availability slots
    print(f"\n📋 Weekly Availability for {day_of_week}:")
    print("-" * 70)
    r = conn.execute(text("""
        SELECT id, start_time, end_time, max_bookings, location
        FROM weekly_availability 
        WHERE lawyer_id = :lid AND day_of_week = :dow AND is_active = true
        ORDER BY start_time
    """), {"lid": lawyer_id, "dow": day_of_week})
    
    for row in r.fetchall():
        print(f"  Slot {row[0]}: {row[1]} - {row[2]} | Max: {row[3]} | {row[4]}")
    
    conn.close()

if __name__ == "__main__":
    main()
