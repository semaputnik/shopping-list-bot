"""remember which onboarding tips a user has dismissed

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0006"
down_revision = "0005"


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column("dismissed_tips", JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("user", "dismissed_tips")
