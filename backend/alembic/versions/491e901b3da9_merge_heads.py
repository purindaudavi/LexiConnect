"""merge heads

Revision ID: 491e901b3da9
Revises: ab91f2c4d7e3, c1a2b3d4e5f6
Create Date: 2026-02-02 18:33:52.411747

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '491e901b3da9'
down_revision: Union[str, None] = ('ab91f2c4d7e3', 'c1a2b3d4e5f6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

















