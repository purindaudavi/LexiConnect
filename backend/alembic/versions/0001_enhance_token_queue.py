"""Enhanced token queue schema with additional fields

Revision ID: 001_enhance_token_queue
Revises: None
Create Date: 2026-01-23 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001_enhance_token_queue'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new columns to token_queue table
    op.add_column('token_queue', sa.Column('time', sa.String(8), nullable=True))
    op.add_column('token_queue', sa.Column('branch_id', sa.Integer(), nullable=True))
    op.add_column('token_queue', sa.Column('reason', sa.String(255), nullable=True))
    op.add_column('token_queue', sa.Column('notes', sa.Text(), nullable=True))
    op.add_column('token_queue', sa.Column('started_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('token_queue', sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('token_queue', sa.Column('created_at', sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()))
    op.add_column('token_queue', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()))
    
    # Create foreign key for branch_id
    op.create_foreign_key(
        'fk_token_queue_branch_id',
        'token_queue',
        'branches',
        ['branch_id'],
        ['id']
    )
    
    # Create indexes
    op.create_index('ix_token_queue_time', 'token_queue', ['time'], unique=False)
    op.create_index('ix_token_queue_branch_id', 'token_queue', ['branch_id'], unique=False)
    op.create_index('ix_token_queue_status', 'token_queue', ['status'], unique=False)
    
    # Update status enum if needed (for PostgreSQL)
    # First, create a backup of the old enum values
    op.execute("ALTER TYPE token_queue_status RENAME TO token_queue_status_old")
    
    # Create new enum
    sa.Enum('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', name='token_queue_status').create(op.get_bind())
    
    # Convert old values to new ones using CASE statement
    op.execute("""
        ALTER TABLE token_queue 
        ALTER COLUMN status TYPE token_queue_status USING (
            CASE status::text
                WHEN 'waiting' THEN 'pending'::token_queue_status
                WHEN 'served' THEN 'completed'::token_queue_status
                ELSE 'pending'::token_queue_status
            END
        )
    """)
    
    # Drop old enum
    op.execute("DROP TYPE token_queue_status_old")


def downgrade() -> None:
    # Drop new indexes
    op.drop_index('ix_token_queue_status')
    op.drop_index('ix_token_queue_branch_id')
    op.drop_index('ix_token_queue_time')
    
    # Drop foreign key
    op.drop_constraint('fk_token_queue_branch_id', 'token_queue', type_='foreignkey')
    
    # Drop columns
    op.drop_column('token_queue', 'updated_at')
    op.drop_column('token_queue', 'created_at')
    op.drop_column('token_queue', 'completed_at')
    op.drop_column('token_queue', 'started_at')
    op.drop_column('token_queue', 'notes')
    op.drop_column('token_queue', 'reason')
    op.drop_column('token_queue', 'branch_id')
    op.drop_column('token_queue', 'time')
    
    # Revert status enum
    op.execute("ALTER TYPE token_queue_status RENAME TO token_queue_status_new")
    sa.Enum('waiting', 'served', name='token_queue_status').create(op.get_bind())
    
    op.execute("""
        ALTER TABLE token_queue 
        ALTER COLUMN status TYPE token_queue_status USING (
            CASE status::text
                WHEN 'pending' THEN 'waiting'::token_queue_status
                WHEN 'completed' THEN 'served'::token_queue_status
                ELSE 'waiting'::token_queue_status
            END
        )
    """)
    
    op.execute("DROP TYPE token_queue_status_new")
