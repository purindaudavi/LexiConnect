"""add case comments and votes tables

Revision ID: c1a2b3d4e5f6
Revises: 5f36a2722701
Create Date: 2026-02-02 18:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c1a2b3d4e5f6"
down_revision: Union[str, None] = "5f36a2722701"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "case_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "case_id",
            sa.Integer(),
            sa.ForeignKey("cases.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "parent_id",
            sa.Integer(),
            sa.ForeignKey("case_comments.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("length(content) >= 2", name="ck_case_comments_content_len"),
    )
    op.create_index("ix_case_comments_case_id", "case_comments", ["case_id"])

    op.create_table(
        "case_comment_votes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "comment_id",
            sa.Integer(),
            sa.ForeignKey("case_comments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("vote", sa.SmallInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("vote in (1, -1)", name="ck_case_comment_votes_vote"),
        sa.UniqueConstraint(
            "comment_id",
            "user_id",
            name="uq_case_comment_votes_comment_user",
        ),
    )
    op.create_index(
        "ix_case_comment_votes_comment_id",
        "case_comment_votes",
        ["comment_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_case_comment_votes_comment_id", table_name="case_comment_votes")
    op.drop_table("case_comment_votes")
    op.drop_index("ix_case_comments_case_id", table_name="case_comments")
    op.drop_table("case_comments")
