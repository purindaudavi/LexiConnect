import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text


def _load_env():
    base_dir = Path(__file__).resolve().parents[1]
    env_path = base_dir / ".env"
    if env_path.exists():
        load_dotenv(env_path)


def _get_database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if url:
        return url
    return "postgresql+psycopg2://lexiconnect:lexiconnect@127.0.0.1:5432/lexiconnect"


def main() -> int:
    _load_env()
    database_url = _get_database_url()
    sql_path = Path(__file__).with_name("create_auth_logs_table.sql")

    if not sql_path.exists():
        print(f"SQL file not found: {sql_path}")
        return 1

    sql = sql_path.read_text(encoding="utf-8")
    try:
        engine = create_engine(database_url, pool_pre_ping=True)
        with engine.begin() as conn:
            conn.execute(text(sql))
        print("Auth logs table created or already exists.")
        return 0
    except Exception as exc:
        print(f"Failed to create auth_logs table: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
