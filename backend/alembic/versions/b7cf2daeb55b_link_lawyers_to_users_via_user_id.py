"""link lawyers to users via user_id

Revision ID: b7cf2daeb55b
Revises: 4790182e7789
Create Date: 2026-01-30 00:48:05.033481

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7cf2daeb55b'
down_revision: Union[str, None] = '4790182e7789'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # 1) Add nullable column first (so we can backfill)
    op.add_column("lawyers", sa.Column("user_id", sa.Integer(), nullable=True))

    # 2) Backfill using email (best-effort)
    # Assumes users.email matches lawyers.email for real lawyer accounts.
    op.execute("""
        UPDATE lawyers l
        SET user_id = u.id
        FROM users u
        WHERE l.email IS NOT NULL
          AND u.email = l.email
          AND l.user_id IS NULL;
    """)

    # 3) Add FK + unique constraint (1-to-1)
    op.create_foreign_key(
        "lawyers_user_id_fkey",
        "lawyers",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint("uq_lawyers_user_id", "lawyers", ["user_id"])

    # Keep it nullable for now, because your seed/demo data may include lawyers
    # without matching users rows.
    # Once you verify every lawyer has a user_id, you can make it NOT NULL.


def downgrade():
    op.drop_constraint("uq_lawyers_user_id", "lawyers", type_="unique")
    op.drop_constraint("lawyers_user_id_fkey", "lawyers", type_="foreignkey")
    op.drop_column("lawyers", "user_id")
















