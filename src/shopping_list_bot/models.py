import secrets
from datetime import UTC, datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, UniqueConstraint
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class List(Base):
    __tablename__ = "list"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
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
