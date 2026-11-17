"""Telegram bot: ``/start`` and ``/help`` explain the basics and open the Mini App."""

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.filters import Command
from aiogram.types import (
    BotCommand,
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

OPEN_BUTTON = {"ru": "Открыть список", "es": "Abrir lista", "en": "Open list"}
# Sent by /start and /help: the basics, step by step.
ONBOARDING_TEXT = {
    "ru": (
        "Как это работает\n\n"
        "1. Откройте список кнопкой ниже.\n"
        "2. Добавляйте несколько позиций сразу через «;» или с новой строки, "
        "а заметку пишите после запятой: молоко, 2 л.\n"
        "3. Пригласите близких: ⋯ → «Пригласить».\n"
        "4. Нажмите на позицию, чтобы вычеркнуть её, а «Куплено» переносит "
        "вычеркнутое в историю покупок.\n"
        "5. Бот напишет вам, когда другие добавят или купят что-то."
    ),
    "es": (
        "Cómo funciona\n\n"
        "1. Abre la lista con el botón de abajo.\n"
        "2. Añade varios artículos a la vez con «;» o en líneas nuevas, "
        "y escribe la nota tras una coma: leche, 2 l.\n"
        "3. Invita a los tuyos: ⋯ → «Invitar».\n"
        "4. Toca un artículo para tacharlo; «Comprado» pasa lo tachado "
        "al historial de compras.\n"
        "5. El bot te avisará cuando otros añadan o compren algo."
    ),
    "en": (
        "How it works\n\n"
        "1. Open the list with the button below.\n"
        "2. Add several items at once with “;” or on new lines, "
        "and write a note after a comma: milk, 2 l.\n"
        "3. Invite your people: ⋯ → “Invite”.\n"
        "4. Tap an item to cross it out; “Bought” moves the crossed-out items "
        "to the purchase history.\n"
        "5. The bot will tell you when others add or buy something."
    ),
}
# Shown on the bot's empty chat (before Start) and in its profile; Telegram caps them at
# 512 and 120 characters.
DESCRIPTION = {
    "ru": (
        "Общие списки покупок прямо в Telegram. Создайте список, пригласите близких "
        "ссылкой и вычёркивайте купленное вместе: все видят изменения сразу, "
        "а бот напомнит, когда кто-то добавит или купит что-то."
    ),
    "es": (
        "Listas de la compra compartidas dentro de Telegram. Crea una lista, invita a los "
        "tuyos con un enlace y tachad lo comprado juntos: todos ven los cambios al instante "
        "y el bot avisa cuando alguien añade o compra algo."
    ),
    "en": (
        "Shared shopping lists inside Telegram. Create a list, invite your people with a "
        "link and cross things off together: everyone sees changes instantly, and the bot "
        "tells you when someone adds or buys something."
    ),
}
SHORT_DESCRIPTION = {
    "ru": "Общие списки покупок: добавляйте, вычёркивайте, делитесь ссылкой.",
    "es": "Listas de la compra compartidas: añade, tacha y comparte con un enlace.",
    "en": "Shared shopping lists: add, cross off and share with a link.",
}
COMMANDS = {
    "ru": {"start": "Открыть список", "help": "Как это работает"},
    "es": {"start": "Abrir la lista", "help": "Cómo funciona"},
    "en": {"start": "Open the list", "help": "How it works"},
}
# Telegram shows the default (no language code) to everyone without a matching language.
BOT_PROFILE_LANGUAGES = (None, "ru", "es", "en")


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

    @dp.message(Command("start", "help"))
    async def start(message: Message) -> None:
        sender = message.from_user
        lang = (
            await language_for(sender.id, sender.language_code)
            if sender
            else effective_language(None, None)
        )
        await message.answer(
            ONBOARDING_TEXT[lang], reply_markup=open_keyboard(settings.webapp_url, lang)
        )

    dp.shutdown.register(lambda: engine.dispose())
    return dp


async def configure_bot(bot: Bot) -> None:
    """Set the bot's description, short description and commands, per language and a default."""
    for code in BOT_PROFILE_LANGUAGES:
        lang = code or "en"
        await bot.set_my_description(DESCRIPTION[lang], language_code=code)
        await bot.set_my_short_description(SHORT_DESCRIPTION[lang], language_code=code)
        commands = [BotCommand(command=c, description=d) for c, d in COMMANDS[lang].items()]
        await bot.set_my_commands(commands, language_code=code)


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
    await configure_bot(bot)
    logging.getLogger(__name__).info("Bot started")
    await build_dispatcher(settings).start_polling(bot)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_bot(Settings()))
