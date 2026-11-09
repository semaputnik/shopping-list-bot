"""Telegram bot: ``/start`` opens the Mini App; the menu button is pointed at it."""

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from . import models
from .config import Settings
from .db import make_engine, make_session_factory
from .i18n import effective_language

OPEN_BUTTON = {"ru": "Открыть список", "es": "Abrir lista"}
START_TEXT = {
    "ru": "Общие списки покупок. Откройте приложение, чтобы начать.",
    "es": "Listas de compras compartidas. Abre la aplicación para empezar.",
}


def open_keyboard(webapp_url: str, lang: str) -> InlineKeyboardMarkup:
    button = InlineKeyboardButton(text=OPEN_BUTTON[lang], web_app=WebAppInfo(url=webapp_url))
    return InlineKeyboardMarkup(inline_keyboard=[[button]])


def build_dispatcher(settings: Settings) -> Dispatcher:
    dp = Dispatcher()
    engine = make_engine(settings.database_url)
    session_factory = make_session_factory(engine)

    def lookup_language(telegram_id: int) -> str | None:
        with session_factory() as session:
            return session.scalar(
                select(models.User.language).where(models.User.telegram_id == telegram_id)
            )

    async def language_for(telegram_id: int, language_code: str | None) -> str:
        """The language chosen in Settings if the user set one, else Telegram's.

        The database is shared with the backend, which owns the schema. If it is unreachable
        or not migrated yet, /start still replies, in Telegram's language.
        """
        try:
            chosen = await asyncio.to_thread(lookup_language, telegram_id)
        except SQLAlchemyError:
            logging.getLogger(__name__).warning("Language lookup failed", exc_info=True)
            chosen = None
        return effective_language(chosen, language_code)

    @dp.message(CommandStart())
    async def start(message: Message) -> None:
        sender = message.from_user
        lang = (
            await language_for(sender.id, sender.language_code)
            if sender
            else effective_language(None, None)
        )
        await message.answer(
            START_TEXT[lang], reply_markup=open_keyboard(settings.webapp_url, lang)
        )

    dp.shutdown.register(lambda: engine.dispose())
    return dp


async def run_bot(settings: Settings) -> None:
    if not settings.bot_token:
        raise SystemExit("SL_BOT_TOKEN is not set")
    bot = Bot(settings.bot_token)
    # The menu button opens the Mini App from any chat with the bot.
    await bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(
            text="Shared Lists", web_app=WebAppInfo(url=settings.webapp_url)
        )
    )
    logging.getLogger(__name__).info("Bot started")
    await build_dispatcher(settings).start_polling(bot)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_bot(Settings()))
