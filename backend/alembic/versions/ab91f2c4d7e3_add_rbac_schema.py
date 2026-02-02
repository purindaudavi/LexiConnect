"""Add RBAC schema

Revision ID: ab91f2c4d7e3
Revises: f7c2a9b4d8e1
Create Date: 2026-01-30 12:55:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "ab91f2c4d7e3"
down_revision: Union[str, None] = "f7c2a9b4d8e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    privilege_effect = sa.Enum("grant", "deny", name="privilege_effect")

    op.create_table(
        "modules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(length=100), nullable=False, unique=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_modules_key", "modules", ["key"], unique=False)

    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "privileges",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(length=150), nullable=False, unique=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("module_id", sa.Integer(), sa.ForeignKey("modules.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_privileges_key", "privileges", ["key"], unique=False)

    op.create_table(
        "role_privileges",
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.id"), primary_key=True),
        sa.Column("privilege_id", sa.Integer(), sa.ForeignKey("privileges.id"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_role_privileges_role_id", "role_privileges", ["role_id"], unique=False)

    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.id"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_user_roles_user_id", "user_roles", ["user_id"], unique=False)

    op.create_table(
        "user_privileges",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("privilege_id", sa.Integer(), sa.ForeignKey("privileges.id"), primary_key=True),
        sa.Column("effect", privilege_effect, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_user_privileges_user_id", "user_privileges", ["user_id"], unique=False)

    op.execute(
        """
        INSERT INTO modules (key, name, description, sort_order)
        VALUES
            ('admin', 'Admin', 'Administration and access control', 0),
            ('bookings', 'Bookings', 'Booking management', 10),
            ('cases', 'Cases', 'Case management', 20),
            ('kyc', 'KYC', 'Know-your-customer workflow', 30),
            ('audit', 'Audit', 'Audit logs and reviews', 40),
            ('documents', 'Documents', 'Document management', 50),
            ('availability', 'Availability', 'Availability scheduling', 60)
        """
    )

    op.execute(
        """
        INSERT INTO roles (name, description, is_system)
        VALUES
            ('ADMIN', 'System administrator', true),
            ('LAWYER', 'Lawyer role', true),
            ('CLIENT', 'Client role', true),
            ('CLERK', 'Clerk role', true)
        """
    )

    op.execute(
        """
        INSERT INTO privileges (key, name, description, module_id)
        SELECT 'access_control.manage', 'Manage access control', 'Manage roles and privileges', m.id
        FROM modules m WHERE m.key = 'admin'
        """
    )
    op.execute(
        """
        INSERT INTO privileges (key, name, description, module_id)
        SELECT 'audit.view', 'View audit log', 'View audit log entries', m.id
        FROM modules m WHERE m.key = 'audit'
        """
    )
    op.execute(
        """
        INSERT INTO privileges (key, name, description, module_id)
        SELECT 'kyc.approve', 'Approve KYC', 'Approve KYC submissions', m.id
        FROM modules m WHERE m.key = 'kyc'
        """
    )
    op.execute(
        """
        INSERT INTO privileges (key, name, description, module_id)
        SELECT 'disputes.manage', 'Manage disputes', 'Resolve disputes', m.id
        FROM modules m WHERE m.key = 'admin'
        """
    )
    op.execute(
        """
        INSERT INTO privileges (key, name, description, module_id)
        SELECT 'booking.confirm', 'Confirm booking', 'Confirm booking requests', m.id
        FROM modules m WHERE m.key = 'bookings'
        """
    )
    op.execute(
        """
        INSERT INTO privileges (key, name, description, module_id)
        SELECT 'booking.reject', 'Reject booking', 'Reject booking requests', m.id
        FROM modules m WHERE m.key = 'bookings'
        """
    )
    op.execute(
        """
        INSERT INTO privileges (key, name, description, module_id)
        SELECT 'booking.view', 'View bookings', 'View booking details', m.id
        FROM modules m WHERE m.key = 'bookings'
        """
    )
    op.execute(
        """
        INSERT INTO privileges (key, name, description, module_id)
        SELECT 'booking.create', 'Create booking', 'Create new bookings', m.id
        FROM modules m WHERE m.key = 'bookings'
        """
    )
    op.execute(
        """
        INSERT INTO privileges (key, name, description, module_id)
        SELECT 'case.feed.view', 'View case feed', 'View case feed', m.id
        FROM modules m WHERE m.key = 'cases'
        """
    )
    op.execute(
        """
        INSERT INTO privileges (key, name, description, module_id)
        SELECT 'case.request.create', 'Create case request', 'Request a case', m.id
        FROM modules m WHERE m.key = 'cases'
        """
    )
    op.execute(
        """
        INSERT INTO privileges (key, name, description, module_id)
        SELECT 'case.request.accept', 'Accept case request', 'Accept a case request', m.id
        FROM modules m WHERE m.key = 'cases'
        """
    )
    op.execute(
        """
        INSERT INTO privileges (key, name, description, module_id)
        SELECT 'document.upload', 'Upload documents', 'Upload documents', m.id
        FROM modules m WHERE m.key = 'documents'
        """
    )
    op.execute(
        """
        INSERT INTO privileges (key, name, description, module_id)
        SELECT 'document.view', 'View documents', 'View documents', m.id
        FROM modules m WHERE m.key = 'documents'
        """
    )
    op.execute(
        """
        INSERT INTO privileges (key, name, description, module_id)
        SELECT 'availability.manage', 'Manage availability', 'Manage availability schedules', m.id
        FROM modules m WHERE m.key = 'availability'
        """
    )
    op.execute(
        """
        INSERT INTO privileges (key, name, description, module_id)
        SELECT 'token_queue.manage', 'Manage token queue', 'Manage token queue entries', m.id
        FROM modules m WHERE m.key = 'bookings'
        """
    )

    op.execute(
        """
        INSERT INTO role_privileges (role_id, privilege_id)
        SELECT r.id, p.id
        FROM roles r
        CROSS JOIN privileges p
        WHERE r.name = 'ADMIN'
        """
    )

    op.execute(
        """
        INSERT INTO role_privileges (role_id, privilege_id)
        SELECT r.id, p.id
        FROM roles r
        JOIN privileges p ON p.key IN (
            'booking.confirm',
            'booking.reject',
            'booking.view',
            'availability.manage',
            'case.feed.view',
            'case.request.create',
            'document.view'
        )
        WHERE r.name = 'LAWYER'
        """
    )

    op.execute(
        """
        INSERT INTO role_privileges (role_id, privilege_id)
        SELECT r.id, p.id
        FROM roles r
        JOIN privileges p ON p.key IN (
            'booking.create',
            'booking.view',
            'case.request.accept',
            'document.upload',
            'document.view'
        )
        WHERE r.name = 'CLIENT'
        """
    )

    op.execute(
        """
        INSERT INTO role_privileges (role_id, privilege_id)
        SELECT r.id, p.id
        FROM roles r
        JOIN privileges p ON p.key IN (
            'booking.view',
            'token_queue.manage',
            'document.view'
        )
        WHERE r.name = 'CLERK'
        """
    )

    op.execute(
        """
        INSERT INTO user_roles (user_id, role_id)
        SELECT u.id, r.id
        FROM users u
        JOIN roles r ON r.name = upper(u.role::text)
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("ix_user_privileges_user_id", table_name="user_privileges")
    op.drop_table("user_privileges")
    op.drop_index("ix_user_roles_user_id", table_name="user_roles")
    op.drop_table("user_roles")
    op.drop_index("ix_role_privileges_role_id", table_name="role_privileges")
    op.drop_table("role_privileges")
    op.drop_index("ix_privileges_key", table_name="privileges")
    op.drop_table("privileges")
    op.drop_table("roles")
    op.drop_index("ix_modules_key", table_name="modules")
    op.drop_table("modules")

    op.execute("DROP TYPE IF EXISTS privilege_effect")
