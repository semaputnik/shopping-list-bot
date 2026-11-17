"""Bot notifications: tell a List's other Members when someone adds items or presses «Куплено».

Writers call ``queue_added`` / ``queue_bought`` inside the transaction that made the change, so a
rolled-back change never notifies. ``Notifier.deliver_due`` sends what is due; the backend runs it
on a timer (see ``create_app``), and tests call it directly with a fake ``send``.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, sessionmaker

from . import models
from .config import Settings
from .i18n import effective_language

logger = logging.getLogger(__name__)

# Names listed in one message before the rest is summarised as "и ещё N".
MAX_NAMES = 5

TEXT = {
    "ru": {
        "added": "Добавлено",
        "bought": "Куплено",
        "more": "и ещё {n}",
        "open": "Открыть список",
    },
    "es": {"added": "Añadido", "bought": "Comprado", "more": "y {n} más", "open": "Abrir la lista"},
}


@dataclass(frozen=True)
class OutgoingMessage:
    chat_id: int
    text: str
    # Opens the Mini App on this List; None when no public Mini App URL is configured.
    button_text: str | None
    button_url: str | None


# Sends one message. Raise ``RetryLater`` to keep the notification for the next round; any other
# exception drops the message for that recipient (e.g. they never started the bot).
Send = Callable[[OutgoingMessage], Awaitable[None]]


class RetryLater(Exception):
    pass


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def queue_added(
    session: Session,
    settings: Settings,
    lst: models.List,
    actor: models.User,
    entries: list[models.Entry],
    now: datetime | None = None,
) -> None:
    """Fold new Entries into the actor's pending "added" message for this List (or start one)."""
    if not entries or len(lst.members) < 2:
        return
    now = now or models.utcnow()
    pending = session.scalar(
        select(models.Notification).where(
            models.Notification.list_id == lst.id,
            models.Notification.actor_id == actor.id,
            models.Notification.kind == "added",
        )
    )
    new_items = [[e.id, e.name] for e in entries]
    if pending is None:
        session.add(
            models.Notification(
                list_id=lst.id,
                actor_id=actor.id,
                kind="added",
                items=json.dumps(new_items, ensure_ascii=False),
                first_at=now,
                due_at=now + timedelta(seconds=settings.notify_added_quiet_seconds),
            )
        )
        return
    pending.items = json.dumps(json.loads(pending.items) + new_items, ensure_ascii=False)
    cap = _aware(pending.first_at) + timedelta(seconds=settings.notify_added_max_seconds)
    pending.due_at = min(now + timedelta(seconds=settings.notify_added_quiet_seconds), cap)


def queue_bought(
    session: Session,
    settings: Settings,
    lst: models.List,
    actor: models.User,
    purchase: models.Purchase,
    names: list[str],
    now: datetime | None = None,
) -> None:
    """Announce a Purchase shortly after «Куплено»; Undo deletes it through the Purchase FK."""
    if not names or len(lst.members) < 2:
        return
    now = now or models.utcnow()
    session.add(
        models.Notification(
            list_id=lst.id,
            actor_id=actor.id,
            kind="bought",
            purchase_id=purchase.id,
            items=json.dumps(names, ensure_ascii=False),
            first_at=now,
            due_at=now + timedelta(seconds=settings.notify_bought_delay_seconds),
        )
    )


def _names_line(names: list[str], lang: str) -> str:
    shown = ", ".join(names[:MAX_NAMES])
    rest = len(names) - MAX_NAMES
    return f"{shown} {TEXT[lang]['more'].format(n=rest)}" if rest > 0 else shown


def compose(kind: str, list_name: str, actor_name: str, names: list[str], lang: str) -> str:
    """«Покупки» · Анна / Добавлено: молоко, хлеб — no verb agreement with the actor needed."""
    return f"«{list_name}» · {actor_name}\n{TEXT[lang][kind]}: {_names_line(names, lang)}"


class Notifier:
    def __init__(
        self, settings: Settings, session_factory: sessionmaker[Session], send: Send | None
    ) -> None:
        self.settings = settings
        self.session_factory = session_factory
        self.send = send

    def _button(self, list_id: int, lang: str) -> tuple[str | None, str | None]:
        base = self.settings.webapp_url.rstrip("/")
        if not base.startswith("https://"):
            return None, None
        return TEXT[lang]["open"], f"{base}/?list={list_id}"

    def _messages(self, session: Session, note: models.Notification) -> list[OutgoingMessage]:
        lst = session.get(models.List, note.list_id)
        actor = session.get(models.User, note.actor_id)
        if lst is None or actor is None:
            return []
        raw = json.loads(note.items)
        if note.kind == "added":
            # Entries that were deleted (Undo-able removal) before the message went are left
            # out; Entries already bought are still news, so they stay.
            removed = set(
                session.scalars(
                    select(models.Entry.id).where(
                        models.Entry.id.in_([entry_id for entry_id, _ in raw]),
                        models.Entry.deleted_at.is_not(None),
                    )
                )
            )
            names = [name for entry_id, name in raw if entry_id not in removed]
        else:
            names = list(raw)
        if not names:
            return []
        out = []
        for member in lst.members:
            user = member.user
            if user.id == actor.id:
                continue
            lang = effective_language(user.language, user.language_code)
            button_text, button_url = self._button(lst.id, lang)
            out.append(
                OutgoingMessage(
                    chat_id=user.telegram_id,
                    text=compose(note.kind, lst.name, actor.first_name, names, lang),
                    button_text=button_text,
                    button_url=button_url,
                )
            )
        return out

    async def deliver_due(self, now: datetime | None = None) -> int:
        """Send every notification that is due; returns how many messages went out."""
        if self.send is None:
            return 0
        now = now or models.utcnow()
        sent = 0
        with self.session_factory() as session:
            due = session.scalars(
                select(models.Notification)
                .where(models.Notification.due_at <= now)
                .order_by(models.Notification.due_at)
            ).all()
            for note in due:
                retry = False
                for message in self._messages(session, note):
                    try:
                        await self.send(message)
                        sent += 1
                    except RetryLater:
                        retry = True
                        break
                    except Exception:  # one recipient must not block the rest
                        logger.warning("Notification to %s failed", message.chat_id, exc_info=True)
                if retry:
                    note.due_at = now + timedelta(seconds=30)
                else:
                    session.execute(
                        delete(models.Notification).where(models.Notification.id == note.id)
                    )
                session.commit()
        return sent


class TelegramSender:
    """A ``Send`` that delivers through the Bot API (aiogram). Close it on shutdown."""

    def __init__(self, bot_token: str) -> None:
        from aiogram import Bot

        self.bot = Bot(bot_token)

    async def __call__(self, message: OutgoingMessage) -> None:
        from aiogram.exceptions import TelegramRetryAfter
        from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

        markup = None
        if message.button_text and message.button_url:
            button = InlineKeyboardButton(
                text=message.button_text, web_app=WebAppInfo(url=message.button_url)
            )
            markup = InlineKeyboardMarkup(inline_keyboard=[[button]])
        try:
            await self.bot.send_message(message.chat_id, message.text, reply_markup=markup)
        except TelegramRetryAfter as exc:
            raise RetryLater from exc

    async def aclose(self) -> None:
        await self.bot.session.close()
