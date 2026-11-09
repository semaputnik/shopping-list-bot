import secrets
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    String,
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Purchase stats: they change on «Куплено» (and its Undo), never on check.
    purchase_count: Mapped[int] = mapped_column(default=0, server_default="0")
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
    # When the Entry was Checked and by whom; null while unchecked.
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    checked_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))

    product: Mapped[Product] = relationship()


class Purchase(Base):
    """One press of «Куплено»: the Checked Entries it removed, when, and who pressed it."""

    __tablename__ = "purchase"

    id: Mapped[int] = mapped_column(primary_key=True)
    list_id: Mapped[int] = mapped_column(ForeignKey("list.id", ondelete="CASCADE"), index=True)
    purchased_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    purchased_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))

    entries: Mapped[list[PurchaseEntry]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )


class PurchaseEntry(Base):
    """Snapshot of an Entry at the moment it was bought; enough to restore it on Undo."""

    __tablename__ = "purchase_entry"

    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_id: Mapped[int] = mapped_column(ForeignKey("purchase.id", ondelete="CASCADE"))
    product_id: Mapped[int] = mapped_column(ForeignKey("product.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200))
    note: Mapped[str | None] = mapped_column(String(500))
    added_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
    entry_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    checked_by: Mapped[int | None] = mapped_column(ForeignKey("user.id", ondelete="SET NULL"))
