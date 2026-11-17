"""product aliases

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"

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
    "entries.unchecked",
    "purchase.created",
    "purchase.undone",
)
NEW_KINDS = (*OLD_KINDS, "product.alias_added", "product.alias_removed")


def _quoted(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def _set_kinds(values: tuple[str, ...]) -> None:
    op.drop_constraint("ck_list_change_kind", "list_change", type_="check")
    op.create_check_constraint("ck_list_change_kind", "list_change", f"kind IN ({_quoted(values)})")


def upgrade() -> None:
    op.create_table(
        "product_alias",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),
        sa.Column(
            "list_id", sa.BigInteger(), sa.ForeignKey("list.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "product_id",
            sa.BigInteger(),
            sa.ForeignKey("product.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("name_norm", sa.String(200), nullable=False),
        sa.UniqueConstraint("list_id", "name_norm"),
    )
    op.create_index("ix_product_alias_product_id", "product_alias", ["product_id"])
    _set_kinds(NEW_KINDS)


def downgrade() -> None:
    op.execute(
        "DELETE FROM list_change WHERE kind IN ('product.alias_added', 'product.alias_removed')"
    )
    _set_kinds(OLD_KINDS)
    op.drop_table("product_alias")
