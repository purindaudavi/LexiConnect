from sqlalchemy import text
from app.database import engine

conn = engine.connect()

print("Users table:")
r = conn.execute(text("SELECT id, full_name, email, role FROM users"))
for row in r.fetchall():
    print(f"  {row}")

print("\nLawyers table:")
r = conn.execute(text("SELECT * FROM lawyers"))
for row in r.fetchall():
    print(f"  {row}")

print("\nToken queue lawyer_id references:")
r = conn.execute(text("SELECT DISTINCT lawyer_id FROM token_queue"))
for row in r.fetchall():
    print(f"  lawyer_id in token_queue: {row[0]}")

conn.close()
