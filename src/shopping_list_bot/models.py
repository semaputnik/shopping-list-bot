import secrets
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    false,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_share_code() -> str:
    # 16 random bytes -> 22 URL-safe characters; unguessable and permanent.
    return secrets.token_urlsafe(16)


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True)
    first_name: Mapped[str] = mapped_column(String(256))
    last_name: Mapped[str | None] = mapped_column(String(256))
    username: Mapped[str | None] = mapped_column(String(64))
    photo_url: Mapped[str | None] = mapped_column(String(1024))
    language_code: Mapped[str | None] = mapped_column(String(16))
    # Interface language the user picked in Settings; None follows Telegram's language_code.
    language: Mapped[str | None] = mapped_column(String(8))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class List(Base):
    __tablename__ = "list"

    id: Mapped[int] = mapped_column(primary_key=True)
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
    __table_args__ = (UniqueConstraint("list_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    list_id: Mapped[int] = mapped_column(ForeignKey("list.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    list: Mapped[List] = relationship(back_populates="members")
    user: Mapped[User] = relationship()


class Product(Base):
    """Something entered into a List at least once: the List's memory. One List only."""

    __tablename__ = "product"
    __table_args__ = (UniqueConstraint("list_id", "name_norm"),)

    id: Mapped[int] = mapped_column(primary_key=True)
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


class Entry(Base):
    """A Product currently on a List. Several Entries may share a Product (ADR 0002)."""

    __tablename__ = "entry"
    __table_args__ = (UniqueConstraint("list_id", "client_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
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

    id: Mapped[int] = mapped_column(primary_key=True)
    list_id: Mapped[int] = mapped_column(ForeignKey("list.id", ondelete="CASCADE"))
    purchased_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    purchased_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))

    entries: Mapped[list[PurchaseEntry]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )


class PurchaseEntry(Base):
    """Snapshot of an Entry at the moment it was bought; enough to restore it on Undo."""

    __tablename__ = "purchase_entry"

    id: Mapped[int] = mapped_column(primary_key=True)
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
    __table_args__ = (UniqueConstraint("list_id", "version"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    list_id: Mapped[int] = mapped_column()
    version: Mapped[int] = mapped_column()
    # e.g. "entry.updated", "member.joined"; see app._touch callers.
    kind: Mapped[str] = mapped_column(String(32))
    entry_id: Mapped[int | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class IdempotencyRecord(Base):
    """The stored answer to a command sent with an Idempotency-Key; a replay returns it as is."""

    __tablename__ = "idempotency_record"
    __table_args__ = (UniqueConstraint("user_id", "key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(String(80))
    method: Mapped[str] = mapped_column(String(8))
    path: Mapped[str] = mapped_column(String(300))
    body_hash: Mapped[str] = mapped_column(String(64), default="")
    status_code: Mapped[int] = mapped_column()
    body: Mapped[str] = mapped_column(Text)
    content_type: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
