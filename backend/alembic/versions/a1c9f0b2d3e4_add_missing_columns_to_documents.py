"""add missing columns to documents

Revision ID: a1c9f0b2d3e4
Revises: 5881c0aee853
Create Date: 2026-02-02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "a1c9f0b2d3e4"
down_revision: Union[str, None] = "5881c0aee853"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(insp, name: str) -> bool:
    return name in set(insp.get_table_names())


def _column_exists(insp, table: str, col: str) -> bool:
    return col in {c["name"] for c in insp.get_columns(table)}


def _index_exists(insp, table: str, index_name: str) -> bool:
    return index_name in {ix["name"] for ix in insp.get_indexes(table)}


def _fk_exists(insp, table: str, fk_name: str) -> bool:
    return fk_name in {fk.get("name") for fk in insp.get_foreign_keys(table)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if not _table_exists(insp, "documents"):
        return

    if not _column_exists(insp, "documents", "uploaded_by_role"):
        op.add_column("documents", sa.Column("uploaded_by_role", sa.String(length=20), nullable=True))

    if not _column_exists(insp, "documents", "original_filename"):
        op.add_column("documents", sa.Column("original_filename", sa.String(length=255), nullable=True))

    if not _column_exists(insp, "documents", "title"):
        op.add_column("documents", sa.Column("title", sa.String(length=255), nullable=True))

    if not _column_exists(insp, "documents", "uploaded_by_user_id"):
        op.add_column("documents", sa.Column("uploaded_by_user_id", sa.Integer(), nullable=True))

    if not _column_exists(insp, "documents", "case_id"):
        op.add_column("documents", sa.Column("case_id", sa.Integer(), nullable=True))

    insp = inspect(bind)
    if _column_exists(insp, "documents", "uploaded_by_user_id") and not _index_exists(
        insp, "documents", "ix_documents_uploaded_by_user_id"
    ):
        op.create_index("ix_documents_uploaded_by_user_id", "documents", ["uploaded_by_user_id"], unique=False)

    if _column_exists(insp, "documents", "case_id") and not _index_exists(
        insp, "documents", "ix_documents_case_id"
    ):
        op.create_index("ix_documents_case_id", "documents", ["case_id"], unique=False)

    if _table_exists(insp, "cases") and _column_exists(insp, "documents", "case_id"):
        if not _fk_exists(insp, "documents", "fk_documents_case"):
            op.create_foreign_key(
                "fk_documents_case",
                "documents",
                "cases",
                ["case_id"],
                ["id"],
                ondelete="CASCADE",
            )

    if _table_exists(insp, "users") and _column_exists(insp, "documents", "uploaded_by_user_id"):
        if not _fk_exists(insp, "documents", "documents_uploaded_by_user_id_fkey"):
            op.create_foreign_key(
                "documents_uploaded_by_user_id_fkey",
                "documents",
                "users",
                ["uploaded_by_user_id"],
                ["id"],
                ondelete="SET NULL",
            )


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    if not _table_exists(insp, "documents"):
        return

    if _fk_exists(insp, "documents", "documents_uploaded_by_user_id_fkey"):
        op.drop_constraint("documents_uploaded_by_user_id_fkey", "documents", type_="foreignkey")
    if _fk_exists(insp, "documents", "fk_documents_case"):
        op.drop_constraint("fk_documents_case", "documents", type_="foreignkey")

    if _index_exists(insp, "documents", "ix_documents_uploaded_by_user_id"):
        op.drop_index("ix_documents_uploaded_by_user_id", table_name="documents")
    if _index_exists(insp, "documents", "ix_documents_case_id"):
        op.drop_index("ix_documents_case_id", table_name="documents")

    if _column_exists(insp, "documents", "case_id"):
        op.drop_column("documents", "case_id")
    if _column_exists(insp, "documents", "uploaded_by_user_id"):
        op.drop_column("documents", "uploaded_by_user_id")
    if _column_exists(insp, "documents", "title"):
        op.drop_column("documents", "title")
    if _column_exists(insp, "documents", "original_filename"):
        op.drop_column("documents", "original_filename")
    if _column_exists(insp, "documents", "uploaded_by_role"):
        op.drop_column("documents", "uploaded_by_role")
