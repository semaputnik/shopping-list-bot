"""invites replace list.share_code

Revision ID: 0005
Revises: 0004
"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"


def upgrade() -> None:
    op.create_table(
        "invite",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),
        sa.Column(
            "list_id", sa.BigInteger(), sa.ForeignKey("list.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("code", sa.String(64), nullable=False, unique=True),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("user.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "uq_invite_active_per_member",
        "invite",
        ["list_id", "created_by"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )
    op.create_index("ix_invite_created_by", "invite", ["created_by"])
    op.add_column(
        "list_member",
        sa.Column("invite_id", sa.BigInteger(), sa.ForeignKey("invite.id", ondelete="SET NULL")),
    )
    op.create_index("ix_list_member_invite_id", "list_member", ["invite_id"])
    # Every share_code becomes the creator's invite, keeping the code so old links still work.
    op.execute(
        "INSERT INTO invite (list_id, code, created_by, created_at) "
        'SELECT id, share_code, created_by, created_at FROM "list"'
    )
    op.drop_column("list", "share_code")


def downgrade() -> None:
    op.add_column("list", sa.Column("share_code", sa.String(64)))
    # The oldest invite's code is the List's code again; a List without one gets a fresh code.
    op.execute(
        'UPDATE "list" SET share_code = COALESCE('
        '(SELECT code FROM invite WHERE invite.list_id = "list".id ORDER BY invite.id LIMIT 1), '
        "md5(random()::text || id::text))"
    )
    op.alter_column("list", "share_code", nullable=False)
    op.create_unique_constraint("list_share_code_key", "list", ["share_code"])
    op.drop_index("ix_list_member_invite_id", table_name="list_member")
    op.drop_column("list_member", "invite_id")
    op.drop_table("invite")
