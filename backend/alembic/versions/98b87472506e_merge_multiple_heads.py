"""merge multiple heads

Revision ID: 98b87472506e
Revises: 001_enhance_token_queue, add_no_show_status, d3cdeccdcef0
Create Date: 2026-01-29 12:54:14.622227

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '98b87472506e'
down_revision: Union[str, None] = ('001_enhance_token_queue', 'add_no_show_status', 'd3cdeccdcef0')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

















