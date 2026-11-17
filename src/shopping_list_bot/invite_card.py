"""The Invite card: a bot message the Mini App shares into a chat (`shareMessage`).

The backend asks the Bot API to store it (`savePreparedInlineMessage`) for the sender and hands
the Mini App the prepared message id.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass

TEXT = {
    "ru": ("{name} приглашает вас в список «{list}»", "Открыть список"),
    "es": ("{name} te invita a la lista «{list}»", "Abrir la lista"),
    "en": ("{name} invites you to the list “{list}”", "Open list"),
}


@dataclass(frozen=True)
class PreparedInvite:
    user_id: int  # Telegram id of the sender: the only person who can share the prepared message
    text: str
    button_text: str
    button_url: str  # the sender's Invite link


# Stores the card with the Bot API and returns the prepared message id.
PrepareInvite = Callable[[PreparedInvite], Awaitable[str]]


def compose_card(
    list_name: str, sender_name: str, sender_telegram_id: int, url: str, lang: str
) -> PreparedInvite:
    text, button = TEXT[lang]
    return PreparedInvite(
        user_id=sender_telegram_id,
        text=text.format(name=sender_name, list=list_name),
        button_text=button,
        button_url=url,
    )
