"""audit_logs add description column

Revision ID: 454d6e1a6884
Revises: 259e24ad64d7
Create Date: 2026-02-01 23:51:31.318008

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '454d6e1a6884'
down_revision: Union[str, None] = '259e24ad64d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS description TEXT;")


def downgrade() -> None:
    op.execute("ALTER TABLE audit_logs DROP COLUMN IF EXISTS description;")
















