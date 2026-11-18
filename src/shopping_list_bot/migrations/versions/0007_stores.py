"""stores: a List's shops, a Product's default store, a Member's grouping

Revision ID: 0007
Revises: 0006
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"

# Frozen copies (a migration must not follow later code changes): the kinds before and after.
OLD_KINDS = (
    "member.joined",
    "list.renamed",
    "member.left",
    "entries.added",
    "entry.updated",
    "entry.deleted",
    "entry.restored",
    "product.hidden",
    "product.renamed",
    "product.alias_added",
    "product.alias_removed",
    "entries.unchecked",
    "purchase.created",
    "purchase.undone",
)
NEW_KINDS = (
    *OLD_KINDS,
    "product.store_changed",
    "store.created",
    "store.renamed",
    "store.deleted",
)


def _quoted(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def _set_kinds(values: tuple[str, ...]) -> None:
    op.drop_constraint("ck_list_change_kind", "list_change", type_="check")
    op.create_check_constraint("ck_list_change_kind", "list_change", f"kind IN ({_quoted(values)})")


def upgrade() -> None:
    op.create_table(
        "store",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),
        sa.Column(
            "list_id", sa.BigInteger(), sa.ForeignKey("list.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("name_norm", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("list_id", "name_norm"),
    )
    op.add_column(
        "product",
        sa.Column(
            "store_id",
            sa.BigInteger(),
            sa.ForeignKey("store.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_product_store_id", "product", ["store_id"])
    op.add_column(
        "list_member",
        sa.Column("grouping", sa.String(16), server_default="category", nullable=False),
    )
    op.create_check_constraint(
        "ck_list_member_grouping", "list_member", "grouping IN ('category', 'store')"
    )
    _set_kinds(NEW_KINDS)


def downgrade() -> None:
    op.execute(f"DELETE FROM list_change WHERE kind IN ({_quoted(NEW_KINDS[len(OLD_KINDS) :])})")
    _set_kinds(OLD_KINDS)
    op.drop_constraint("ck_list_member_grouping", "list_member", type_="check")
    op.drop_column("list_member", "grouping")
    op.drop_index("ix_product_store_id", "product")
    op.drop_column("product", "store_id")
    op.drop_table("store")
