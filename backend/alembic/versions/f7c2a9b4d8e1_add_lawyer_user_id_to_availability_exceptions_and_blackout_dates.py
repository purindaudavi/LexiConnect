"""Add lawyer_user_id to availability_exceptions and blackout_dates

Revision ID: f7c2a9b4d8e1
Revises: d1f0a4b2c9e1
Create Date: 2026-01-30 12:05:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f7c2a9b4d8e1"
down_revision: Union[str, None] = "d1f0a4b2c9e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("availability_exceptions", sa.Column("lawyer_user_id", sa.Integer(), nullable=True))
    op.add_column("blackout_dates", sa.Column("lawyer_user_id", sa.Integer(), nullable=True))

    op.create_foreign_key(
        "fk_availability_exceptions_lawyer_user_id_users",
        "availability_exceptions",
        "users",
        ["lawyer_user_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_blackout_dates_lawyer_user_id_users",
        "blackout_dates",
        "users",
        ["lawyer_user_id"],
        ["id"],
    )

    op.create_index(
        "ix_availability_exceptions_lawyer_user_id",
        "availability_exceptions",
        ["lawyer_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_blackout_dates_lawyer_user_id",
        "blackout_dates",
        ["lawyer_user_id"],
        unique=False,
    )

    availability_exceptions = sa.table(
        "availability_exceptions",
        sa.column("lawyer_id", sa.Integer()),
        sa.column("lawyer_user_id", sa.Integer()),
    )
    blackout_dates = sa.table(
        "blackout_dates",
        sa.column("lawyer_id", sa.Integer()),
        sa.column("lawyer_user_id", sa.Integer()),
    )
    lawyers = sa.table(
        "lawyers",
        sa.column("id", sa.Integer()),
        sa.column("email", sa.String()),
    )
    users = sa.table(
        "users",
        sa.column("id", sa.Integer()),
        sa.column("email", sa.String()),
    )

    availability_user_subquery = (
        sa.select(users.c.id)
        .select_from(lawyers.join(users, users.c.email == lawyers.c.email))
        .where(lawyers.c.id == availability_exceptions.c.lawyer_id)
        .where(lawyers.c.email.isnot(None))
        .scalar_subquery()
    )
    blackout_user_subquery = (
        sa.select(users.c.id)
        .select_from(lawyers.join(users, users.c.email == lawyers.c.email))
        .where(lawyers.c.id == blackout_dates.c.lawyer_id)
        .where(lawyers.c.email.isnot(None))
        .scalar_subquery()
    )

    op.execute(
        availability_exceptions.update()
        .values(lawyer_user_id=availability_user_subquery)
        .where(availability_exceptions.c.lawyer_user_id.is_(None))
    )
    op.execute(
        blackout_dates.update()
        .values(lawyer_user_id=blackout_user_subquery)
        .where(blackout_dates.c.lawyer_user_id.is_(None))
    )


def downgrade() -> None:
    op.drop_index("ix_blackout_dates_lawyer_user_id", table_name="blackout_dates")
    op.drop_index("ix_availability_exceptions_lawyer_user_id", table_name="availability_exceptions")

    op.drop_constraint(
        "fk_blackout_dates_lawyer_user_id_users",
        "blackout_dates",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_availability_exceptions_lawyer_user_id_users",
        "availability_exceptions",
        type_="foreignkey",
    )

    op.drop_column("blackout_dates", "lawyer_user_id")
    op.drop_column("availability_exceptions", "lawyer_user_id")
