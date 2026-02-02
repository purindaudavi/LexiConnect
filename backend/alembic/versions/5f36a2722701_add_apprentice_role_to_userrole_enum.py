"""add apprentice role to userrole enum

Revision ID: 5f36a2722701
Revises: 773247dc8a96
Create Date: 2026-01-15 19:46:57.029724

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5f36a2722701'
down_revision: Union[str, None] = '773247dc8a96'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

















