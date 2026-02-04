"""make documents.booking_id nullable

Revision ID: b2f1a6c7d8e9
Revises: a1c9f0b2d3e4
Create Date: 2026-02-02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "b2f1a6c7d8e9"
down_revision: Union[str, None] = "a1c9f0b2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(insp, name: str) -> bool:
    return name in set(insp.get_table_names())


def _column_exists(insp, table: str, col: str) -> bool:
    return col in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if not _table_exists(insp, "documents"):
        return
    if not _column_exists(insp, "documents", "booking_id"):
        return

    op.alter_column(
        "documents",
        "booking_id",
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if not _table_exists(insp, "documents"):
        return
    if not _column_exists(insp, "documents", "booking_id"):
        return

    op.alter_column(
        "documents",
        "booking_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
