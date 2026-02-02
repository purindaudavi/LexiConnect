"""Use user_id for branches and weekly_availability

Revision ID: c7b1a2f0c4c1
Revises: b7cf2daeb55b
Create Date: 2026-01-29 18:05:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c7b1a2f0c4c1"
down_revision: Union[str, None] = "b7cf2daeb55b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("branches", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column("weekly_availability", sa.Column("user_id", sa.Integer(), nullable=True))

    op.execute(
        """
        UPDATE branches b
        SET user_id = l.user_id
        FROM lawyers l
        WHERE b.lawyer_id = l.id
        """
    )
    op.execute(
        """
        UPDATE weekly_availability wa
        SET user_id = l.user_id
        FROM lawyers l
        WHERE wa.lawyer_id = l.id
        """
    )

    op.alter_column("branches", "user_id", nullable=False)
    op.alter_column("weekly_availability", "user_id", nullable=False)

    op.create_foreign_key(
        "fk_branches_user_id_users",
        "branches",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_weekly_availability_user_id_users",
        "weekly_availability",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.create_index("ix_branches_user_id", "branches", ["user_id"], unique=False)
    op.create_index("ix_weekly_availability_user_id", "weekly_availability", ["user_id"], unique=False)
    op.create_index(
        "ix_weekly_availability_user_id_branch_day",
        "weekly_availability",
        ["user_id", "branch_id", "day_of_week"],
        unique=False,
    )

    op.drop_constraint("weekly_availability_lawyer_id_fkey", "weekly_availability", type_="foreignkey")
    op.drop_constraint("branches_lawyer_id_fkey", "branches", type_="foreignkey")
    op.drop_index("ix_weekly_availability_lawyer_id", table_name="weekly_availability")
    op.drop_column("weekly_availability", "lawyer_id")
    op.drop_column("branches", "lawyer_id")


def downgrade() -> None:
    op.add_column("branches", sa.Column("lawyer_id", sa.Integer(), nullable=True))
    op.add_column("weekly_availability", sa.Column("lawyer_id", sa.Integer(), nullable=True))

    op.execute(
        """
        UPDATE branches b
        SET lawyer_id = l.id
        FROM lawyers l
        WHERE b.user_id = l.user_id
        """
    )
    op.execute(
        """
        UPDATE weekly_availability wa
        SET lawyer_id = l.id
        FROM lawyers l
        WHERE wa.user_id = l.user_id
        """
    )

    op.alter_column("branches", "lawyer_id", nullable=True)
    op.alter_column("weekly_availability", "lawyer_id", nullable=True)

    op.create_foreign_key(
        "branches_lawyer_id_fkey",
        "branches",
        "lawyers",
        ["lawyer_id"],
        ["id"],
    )
    op.create_foreign_key(
        "weekly_availability_lawyer_id_fkey",
        "weekly_availability",
        "lawyers",
        ["lawyer_id"],
        ["id"],
    )
    op.create_index("ix_weekly_availability_lawyer_id", "weekly_availability", ["lawyer_id"], unique=False)

    op.drop_index("ix_weekly_availability_user_id_branch_day", table_name="weekly_availability")
    op.drop_index("ix_weekly_availability_user_id", table_name="weekly_availability")
    op.drop_index("ix_branches_user_id", table_name="branches")
    op.drop_constraint("fk_weekly_availability_user_id_users", "weekly_availability", type_="foreignkey")
    op.drop_constraint("fk_branches_user_id_users", "branches", type_="foreignkey")
    op.drop_column("weekly_availability", "user_id")
    op.drop_column("branches", "user_id")
