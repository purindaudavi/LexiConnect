"""add nic must_change_password password reset tokens

Revision ID: 361b2af8dd94
Revises: 491e901b3da9
Create Date: 2026-02-03 01:01:08.537389

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '361b2af8dd94'
down_revision: Union[str, None] = '491e901b3da9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # users table changes
    op.add_column("users", sa.Column("nic", sa.String(length=20), nullable=True))
    op.add_column("users", sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("users", sa.Column("created_by_user_id", sa.Integer(), nullable=True))  # change to UUID if your users.id is UUID

    op.create_foreign_key(
        "fk_users_created_by_user_id",
        "users",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # password reset tokens
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),  # change to UUID if needed
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_password_reset_tokens_user_id", "password_reset_tokens", ["user_id"])
    op.create_index("ix_password_reset_tokens_token_hash", "password_reset_tokens", ["token_hash"], unique=True)


def downgrade():
    op.drop_index("ix_password_reset_tokens_token_hash", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_user_id", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")

    op.drop_constraint("fk_users_created_by_user_id", "users", type_="foreignkey")
    op.drop_column("users", "created_by_user_id")
    op.drop_column("users", "must_change_password")
    op.drop_column("users", "nic")















