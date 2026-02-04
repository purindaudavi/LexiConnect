from sqlalchemy import text
from app.database import engine

SQL = """
CREATE TABLE IF NOT EXISTS document_comments (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id INTEGER NULL,
  created_by_role VARCHAR(50) NULL
);

CREATE INDEX IF NOT EXISTS ix_document_comments_document_id
  ON document_comments(document_id);

CREATE INDEX IF NOT EXISTS ix_document_comments_created_by_user_id
  ON document_comments(created_by_user_id);
"""

with engine.begin() as conn:
    conn.execute(text(SQL))

print("✅ document_comments table ensured (created if missing).")
