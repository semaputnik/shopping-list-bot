"""store the remaining initData user flags

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"

FLAGS = ("is_premium", "allows_write_to_pm", "added_to_attachment_menu")


def upgrade() -> None:
    for flag in FLAGS:
        op.add_column(
            "user", sa.Column(flag, sa.Boolean(), server_default=sa.false(), nullable=False)
        )


def downgrade() -> None:
    for flag in reversed(FLAGS):
        op.drop_column("user", flag)
