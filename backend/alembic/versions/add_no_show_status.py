"""add no_show status to token_queue

Revision ID: add_no_show_status
Revises: 
Create Date: 2026-01-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_no_show_status'
down_revision: Union[str, None] = None  # Will be set automatically
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add 'no_show' to the token_queue_status enum
    # PostgreSQL requires ALTER TYPE to add new enum values
    op.execute("ALTER TYPE token_queue_status ADD VALUE IF NOT EXISTS 'no_show'")


def downgrade() -> None:
    # Note: PostgreSQL doesn't support removing enum values easily
    # You would need to recreate the enum type without 'no_show'
    pass
