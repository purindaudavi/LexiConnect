from sqlalchemy import text
from app.database import engine

conn = engine.connect()
r = conn.execute(text("SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'token_queue_status')"))
print("Enum values:", [x[0] for x in r.fetchall()])

# Also check table structure
r2 = conn.execute(text("SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'token_queue'"))
print("\nTable columns:")
for row in r2.fetchall():
    print(f"  {row[0]}: {row[1]} ({row[2]})")
