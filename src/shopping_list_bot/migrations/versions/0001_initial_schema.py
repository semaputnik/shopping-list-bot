"""initial schema

Revision ID: 0001
Revises:
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None


def upgrade() -> None:
    op.create_table(
        "list_change",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("list_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("entry_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("list_id", "version"),
    )
    op.create_table(
        "user",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("telegram_id", sa.BigInteger(), nullable=False),
        sa.Column("first_name", sa.String(length=256), nullable=False),
        sa.Column("last_name", sa.String(length=256), nullable=True),
        sa.Column("username", sa.String(length=64), nullable=True),
        sa.Column("photo_url", sa.String(length=1024), nullable=True),
        sa.Column("language_code", sa.String(length=16), nullable=True),
        sa.Column("language", sa.String(length=8), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("telegram_id"),
    )
    op.create_table(
        "idempotency_record",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column("method", sa.String(length=8), nullable=False),
        sa.Column("path", sa.String(length=300), nullable=False),
        sa.Column("body_hash", sa.String(length=64), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "key"),
    )
    op.create_table(
        "list",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("name_is_default", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("share_code", sa.String(length=64), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("share_code"),
    )
    op.create_table(
        "list_member",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("list_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["list_id"], ["list.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("list_id", "user_id"),
    )
    op.create_table(
        "product",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("list_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("name_norm", sa.String(length=200), nullable=False),
        sa.Column("category_key", sa.String(length=32), nullable=False),
        sa.Column("purchase_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("hidden", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_purchased_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["list_id"], ["list.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("list_id", "name_norm"),
    )
    op.create_table(
        "purchase",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("list_id", sa.Integer(), nullable=False),
        sa.Column("purchased_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("purchased_by", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["list_id"], ["list.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["purchased_by"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_purchase_list_id_purchased_at", "purchase", ["list_id", "purchased_at"], unique=False
    )
    op.create_table(
        "entry",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("list_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("added_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("client_id", sa.String(length=80), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("checked_by", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["added_by"], ["user.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["checked_by"], ["user.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["list_id"], ["list.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["product.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("list_id", "client_id"),
    )
    op.create_table(
        "notification",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("list_id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("purchase_id", sa.Integer(), nullable=True),
        sa.Column("items", sa.Text(), nullable=False),
        sa.Column("first_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["actor_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["list_id"], ["list.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["purchase_id"], ["purchase.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notification_due", "notification", ["due_at"], unique=False)
    op.create_index(
        op.f("ix_notification_purchase_id"), "notification", ["purchase_id"], unique=False
    )
    op.create_table(
        "purchase_entry",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("purchase_id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("added_by", sa.Integer(), nullable=True),
        sa.Column("entry_created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("checked_by", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["added_by"], ["user.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["checked_by"], ["user.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["product_id"], ["product.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["purchase_id"], ["purchase.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_purchase_entry_product_id"), "purchase_entry", ["product_id"], unique=False
    )
    op.create_index(
        op.f("ix_purchase_entry_purchase_id"), "purchase_entry", ["purchase_id"], unique=False
    )


def downgrade() -> None:
    op.drop_table("purchase_entry")
    op.drop_table("notification")
    op.drop_table("entry")
    op.drop_table("purchase")
    op.drop_table("product")
    op.drop_table("list_member")
    op.drop_table("list")
    op.drop_table("idempotency_record")
    op.drop_table("user")
    op.drop_table("list_change")
