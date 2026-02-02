"""add case specialization

Revision ID: 4790182e7789
Revises: 98b87472506e
Create Date: 2026-01-29 16:39:00.873133

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4790182e7789'
down_revision: Union[str, None] = '98b87472506e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None



def upgrade() -> None:
    # 1) Create specializations table (if not already created elsewhere)
    op.create_table(
        "specializations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False, unique=True, index=True),
    )

    # 2) Add specialization_id column to cases
    op.add_column("cases", sa.Column("specialization_id", sa.Integer(), nullable=True))

    # 3) Add FK constraint
    op.create_foreign_key(
        "fk_cases_specialization_id_specializations",
        "cases",
        "specializations",
        ["specialization_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    # 4) Index for filtering
    op.create_index("ix_cases_specialization_id", "cases", ["specialization_id"])


def downgrade() -> None:
    op.drop_index("ix_cases_specialization_id", table_name="cases")
    op.drop_constraint(
        "fk_cases_specialization_id_specializations",
        "cases",
        type_="foreignkey",
    )
    op.drop_column("cases", "specialization_id")
    op.drop_table("specializations")
















