"""Add booking overlap guard columns and constraint

Revision ID: d1f0a4b2c9e1
Revises: c7b1a2f0c4c1
Create Date: 2026-01-30 11:15:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d1f0a4b2c9e1"
down_revision: Union[str, None] = "c7b1a2f0c4c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "bookings",
        sa.Column("blocks_time", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_index("ix_bookings_ends_at", "bookings", ["ends_at"], unique=False)
    op.create_index("ix_bookings_blocks_time", "bookings", ["blocks_time"], unique=False)

    # Backfill ends_at based on service_packages.duration
    op.execute(
        """
        UPDATE bookings b
        SET ends_at = b.scheduled_at + (sp.duration || ' minutes')::interval
        FROM service_packages sp
        WHERE b.service_package_id = sp.id
          AND b.scheduled_at IS NOT NULL
          AND b.ends_at IS NULL
          AND sp.duration IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE bookings
        SET ends_at = scheduled_at
        WHERE scheduled_at IS NOT NULL AND ends_at IS NULL
        """
    )

    op.execute(
        """
        UPDATE bookings
        SET blocks_time = CASE
            WHEN lower(status) IN ('pending','confirmed') THEN true
            ELSE false
        END
        """
    )

    # Resolve exact duplicate ranges (same lawyer/branch/time window)
    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                row_number() OVER (
                    PARTITION BY lawyer_id, branch_id, scheduled_at, ends_at
                    ORDER BY
                        CASE
                            WHEN lower(status) = 'confirmed' THEN 3
                            WHEN lower(status) = 'pending' THEN 2
                            ELSE 1
                        END DESC,
                        created_at ASC,
                        id ASC
                ) AS rn
            FROM bookings
            WHERE blocks_time IS TRUE
              AND scheduled_at IS NOT NULL
              AND ends_at IS NOT NULL
        )
        UPDATE bookings b
        SET status = 'rejected',
            blocks_time = FALSE,
            note = COALESCE(b.note, '') || ' [auto-resolved overlap during migration]'
        FROM ranked r
        WHERE b.id = r.id AND r.rn > 1
        """
    )

    # Resolve remaining overlaps (greedy by priority/created_at/id)
    op.execute(
        """
        WITH ovlp AS (
            SELECT
                a.id AS a_id,
                b.id AS b_id,
                CASE
                    WHEN lower(a.status) = 'confirmed' THEN 3
                    WHEN lower(a.status) = 'pending' THEN 2
                    ELSE 1
                END AS a_priority,
                CASE
                    WHEN lower(b.status) = 'confirmed' THEN 3
                    WHEN lower(b.status) = 'pending' THEN 2
                    ELSE 1
                END AS b_priority,
                a.created_at AS a_created,
                b.created_at AS b_created
            FROM bookings a
            JOIN bookings b
              ON a.id < b.id
             AND a.lawyer_id = b.lawyer_id
             AND a.branch_id = b.branch_id
             AND a.blocks_time IS TRUE
             AND b.blocks_time IS TRUE
             AND a.scheduled_at IS NOT NULL
             AND a.ends_at IS NOT NULL
             AND b.scheduled_at IS NOT NULL
             AND b.ends_at IS NOT NULL
             AND tstzrange(a.scheduled_at, a.ends_at, '[)') && tstzrange(b.scheduled_at, b.ends_at, '[)')
        ),
        losers AS (
            SELECT
                CASE
                    WHEN a_priority > b_priority THEN b_id
                    WHEN b_priority > a_priority THEN a_id
                    WHEN a_created <= b_created THEN b_id
                    ELSE a_id
                END AS loser_id
            FROM ovlp
        )
        UPDATE bookings b
        SET status = 'rejected',
            blocks_time = FALSE,
            note = COALESCE(b.note, '') || ' [auto-resolved overlap during migration]'
        WHERE b.id IN (SELECT loser_id FROM losers)
        """
    )

    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.execute(
        """
        ALTER TABLE bookings
        ADD CONSTRAINT bookings_no_overlap
        EXCLUDE USING gist (
            lawyer_id WITH =,
            branch_id WITH =,
            tstzrange(scheduled_at, ends_at, '[)') WITH &&
        )
        WHERE (blocks_time IS TRUE AND scheduled_at IS NOT NULL AND ends_at IS NOT NULL)
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap")
    op.drop_index("ix_bookings_blocks_time", table_name="bookings")
    op.drop_index("ix_bookings_ends_at", table_name="bookings")
    op.drop_column("bookings", "blocks_time")
    op.drop_column("bookings", "ends_at")
