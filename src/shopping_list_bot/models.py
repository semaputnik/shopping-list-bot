import secrets
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    String,
    Text,
    UniqueConstraint,
    false,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .categories import CATEGORIES
from .db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


def _pk() -> Mapped[int]:
    return mapped_column(BigInteger, Identity(always=False), primary_key=True)


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


# What `_touch` in app.py logs; the CHECK on list_change.kind and migration 0002 list the same.
LIST_CHANGE_KINDS = (
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
NOTIFICATION_KINDS = ("added", "bought")
LANGUAGES = ("ru", "es", "en")


def new_share_code() -> str:
    # 16 random bytes -> 22 URL-safe characters; unguessable and permanent.
    return secrets.token_urlsafe(16)


class User(Base):
    __tablename__ = "user"
    __table_args__ = (CheckConstraint(_in("language", LANGUAGES), name="ck_user_language"),)

    id: Mapped[int] = _pk()
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True)
    first_name: Mapped[str] = mapped_column(String(256))
    last_name: Mapped[str | None] = mapped_column(String(256))
    username: Mapped[str | None] = mapped_column(String(64))
    photo_url: Mapped[str | None] = mapped_column(String(1024))
    language_code: Mapped[str | None] = mapped_column(String(16))
    is_premium: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    allows_write_to_pm: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    added_to_attachment_menu: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false()
    )
    # Interface language the user picked in Settings; None follows Telegram's language_code.
    language: Mapped[str | None] = mapped_column(String(8))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class List(Base):
    __tablename__ = "list"

    id: Mapped[int] = _pk()
    name: Mapped[str] = mapped_column(String(200))
    # True while the List still has its auto-created name; it is then shown in each
    # viewer's language. Whatever renames a List must set this to False.
    name_is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    share_code: Mapped[str] = mapped_column(String(64), unique=True, default=new_share_code)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Time of the last change; Lists are ordered by it.
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Monotonic counter bumped by every mutation of the List.
    version: Mapped[int] = mapped_column(default=0)

    members: Mapped[list[ListMember]] = relationship(
        back_populates="list", cascade="all, delete-orphan", passive_deletes=True
    )


class ListMember(Base):
    __tablename__ = "list_member"
    __table_args__ = (
        UniqueConstraint("list_id", "user_id"),
        Index("ix_list_member_user_id", "user_id"),
    )

    id: Mapped[int] = _pk()
    list_id: Mapped[int] = mapped_column(ForeignKey("list.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    list: Mapped[List] = relationship(back_populates="members")
    user: Mapped[User] = relationship()


class Product(Base):
    """Something entered into a List at least once: the List's memory. One List only."""

    __tablename__ = "product"
    __table_args__ = (
        UniqueConstraint("list_id", "name_norm"),
        Index("ix_product_list_id", "list_id"),
        CheckConstraint(
            _in("category_key", tuple(c.key for c in CATEGORIES)), name="ck_product_category_key"
        ),
    )

    id: Mapped[int] = _pk()
    list_id: Mapped[int] = mapped_column(ForeignKey("list.id", ondelete="CASCADE"))
    # Display name as first typed; name_norm is the normalised key (see normalize.py).
    name: Mapped[str] = mapped_column(String(200))
    name_norm: Mapped[str] = mapped_column(String(200))
    category_key: Mapped[str] = mapped_column(String(32))
    # Times bought (updated on «Куплено»); breaks ties between equally good suggestions.
    purchase_count: Mapped[int] = mapped_column(default=0, server_default="0")
    # Removed from memory: not suggested any more, but Entries and History keep the Product,
    # and entering the name again brings it back.
    hidden: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Stats change on «Куплено» (and its Undo), never on check.
    last_purchased_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Other names that find this Product and add it; eager, since every Entry payload lists them.
    aliases: Mapped[list[ProductAlias]] = relationship(
        order_by="ProductAlias.id",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )


class ProductAlias(Base):
    """Another name for a Product, added by hand. Unique among the List's Products and aliases."""

    __tablename__ = "product_alias"
    __table_args__ = (
        UniqueConstraint("list_id", "name_norm"),
        Index("ix_product_alias_product_id", "product_id"),
    )

    id: Mapped[int] = _pk()
    # Repeats the Product's List so the DB can enforce one name per List.
    list_id: Mapped[int] = mapped_column(ForeignKey("list.id", ondelete="CASCADE"))
    product_id: Mapped[int] = mapped_column(ForeignKey("product.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200))
    name_norm: Mapped[str] = mapped_column(String(200))


class Entry(Base):
    """A Product currently on a List. Several Entries may share a Product (ADR 0002)."""

    __tablename__ = "entry"
    __table_args__ = (
        UniqueConstraint("list_id", "client_id"),
        Index("ix_entry_list_id_live", "list_id", postgresql_where=text("deleted_at IS NULL")),
        Index("ix_entry_product_id", "product_id"),
    )

    id: Mapped[int] = _pk()
    list_id: Mapped[int] = mapped_column(ForeignKey("list.id", ondelete="CASCADE"))
    product_id: Mapped[int] = mapped_column(ForeignKey("product.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200))
    note: Mapped[str | None] = mapped_column(String(500))
    added_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Client-generated idempotency id (a replayed add must not duplicate the Entry).
    client_id: Mapped[str | None] = mapped_column(String(80))
    # Soft delete. INVARIANT: every query that lists, counts or edits Entries MUST filter
    # ``deleted_at IS NULL`` (only delete/restore look at deleted Entries). A deleted Entry
    # stays restorable with no time limit: the 5 s Undo is a UI affordance, not a server rule.
    # A replayed add whose client_id belongs to a deleted Entry returns 200 with that Entry,
    # which is now invisible; it is not re-created.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # When the Entry was Checked and by whom; null while unchecked.
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    checked_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))

    product: Mapped[Product] = relationship()
    author: Mapped[User | None] = relationship(foreign_keys=[added_by])


class Purchase(Base):
    """One press of «Куплено»: the Checked Entries it removed, when, and who pressed it."""

    __tablename__ = "purchase"
    # History pages a List's Purchases newest first.
    __table_args__ = (Index("ix_purchase_list_id_purchased_at", "list_id", "purchased_at"),)

    id: Mapped[int] = _pk()
    list_id: Mapped[int] = mapped_column(ForeignKey("list.id", ondelete="CASCADE"))
    purchased_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    purchased_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))

    entries: Mapped[list[PurchaseEntry]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )


class PurchaseEntry(Base):
    """Snapshot of an Entry at the moment it was bought; enough to restore it on Undo."""

    __tablename__ = "purchase_entry"

    id: Mapped[int] = _pk()
    purchase_id: Mapped[int] = mapped_column(
        ForeignKey("purchase.id", ondelete="CASCADE"), index=True
    )
    # Indexed: Undo recomputes a Product's stats from its PurchaseEntries.
    product_id: Mapped[int] = mapped_column(
        ForeignKey("product.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    note: Mapped[str | None] = mapped_column(String(500))
    added_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    entry_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    checked_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))


class ListChange(Base):
    """One row of a List's change log: what a version bump was. Backs `changes?since=`.

    Not a foreign key on purpose: the log of a deleted List is removed with it explicitly.
    """

    __tablename__ = "list_change"
    __table_args__ = (
        UniqueConstraint("list_id", "version"),
        CheckConstraint(_in("kind", LIST_CHANGE_KINDS), name="ck_list_change_kind"),
    )

    id: Mapped[int] = _pk()
    list_id: Mapped[int] = mapped_column(BigInteger)
    version: Mapped[int] = mapped_column()
    # e.g. "entry.updated", "member.joined"; see app._touch callers.
    kind: Mapped[str] = mapped_column(String(32))
    entry_id: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class IdempotencyRecord(Base):
    """The stored answer to a command sent with an Idempotency-Key; a replay returns it as is."""

    __tablename__ = "idempotency_record"
    __table_args__ = (UniqueConstraint("user_id", "key"),)

    id: Mapped[int] = _pk()
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(String(80))
    method: Mapped[str] = mapped_column(String(8))
    path: Mapped[str] = mapped_column(String(300))
    body_hash: Mapped[str] = mapped_column(String(64), default="")
    status_code: Mapped[int] = mapped_column()
    body: Mapped[str] = mapped_column(Text)
    content_type: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Notification(Base):
    """A bot message waiting to go to a List's other Members.

    "added": one row per (List, Member) while that Member keeps adding; each add pushes
    ``due_at`` out by the quiet period, capped from the first add, so a burst of adds becomes
    one message. "bought": one row per Purchase, due a little after «Куплено»; Undo deletes the
    Purchase and, by cascade, this row, so an undone purchase is never announced.
    """

    __tablename__ = "notification"
    __table_args__ = (
        Index("ix_notification_due", "due_at"),
        Index("ix_notification_list_id_actor_id_kind", "list_id", "actor_id", "kind"),
        CheckConstraint(_in("kind", NOTIFICATION_KINDS), name="ck_notification_kind"),
    )

    id: Mapped[int] = _pk()
    list_id: Mapped[int] = mapped_column(ForeignKey("list.id", ondelete="CASCADE"))
    actor_id: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(16))
    purchase_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase.id", ondelete="CASCADE"), index=True
    )
    # [[entry_id, name], ...] for "added" (an Entry removed before sending is dropped),
    # [name, ...] for "bought".
    items: Mapped[list] = mapped_column(JSONB, default=list)
    first_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
