"""Telegram bot: ``/start`` and ``/help`` explain the basics and open the Mini App."""

import asyncio
import html
import logging
from pathlib import Path

from aiogram import Bot, Dispatcher
from aiogram.enums import ParseMode
from aiogram.filters import Command
from aiogram.types import (
    BotCommand,
    FSInputFile,
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
# Sent by /start and /help as the caption of the welcome banner (HTML; Telegram caps captions at
# 1024 characters). {greeting} comes from GREETING.
ONBOARDING_TEXT = {
    "ru": (
        "<b>{greeting} 👋</b>\n"
        "Shared Lists — общий список покупок прямо в Telegram.\n\n"
        "🛒 <b>Добавляйте</b> сразу несколько: <code>молоко, 2 л; хлеб; яйца</code>\n"
        "👆 <b>Вычёркивайте</b> тапом по позиции прямо в магазине\n"
        "✅ <b>«Куплено»</b> переносит вычеркнутое в историю покупок\n"
        "👨‍👩‍👧 <b>Зовите своих</b>: ⋯ → «Пригласить»\n\n"
        "<blockquote>🔔 Я напишу, когда кто-то добавит или купит что-то.</blockquote>"
    ),
    "es": (
        "<b>{greeting} 👋</b>\n"
        "Shared Lists es una lista de la compra compartida dentro de Telegram.\n\n"
        "🛒 <b>Añade</b> varios a la vez: <code>leche, 2 l; pan; huevos</code>\n"
        "👆 <b>Tacha</b> tocando un artículo, ya en la tienda\n"
        "✅ <b>«Comprado»</b> pasa lo tachado al historial de compras\n"
        "👨‍👩‍👧 <b>Invita a los tuyos</b>: ⋯ → «Invitar»\n\n"
        "<blockquote>🔔 Te avisaré cuando alguien añada o compre algo.</blockquote>"
    ),
    "en": (
        "<b>{greeting} 👋</b>\n"
        "Shared Lists is a shared shopping list right inside Telegram.\n\n"
        "🛒 <b>Add</b> several at once: <code>milk, 2 l; bread; eggs</code>\n"
        "👆 <b>Cross off</b> with a tap, right in the store\n"
        "✅ <b>“Bought”</b> moves the crossed-off items to the purchase history\n"
        "👨‍👩‍👧 <b>Invite your people</b>: ⋯ → “Invite”\n\n"
        "<blockquote>🔔 I’ll tell you when someone adds or buys something.</blockquote>"
    ),
}
# With the user's first name (HTML-escaped) when Telegram gives one, and without it otherwise.
GREETING = {
    "ru": ("Привет, {name}!", "Привет!"),
    "es": ("¡Hola, {name}!", "¡Hola!"),
    "en": ("Hi, {name}!", "Hi!"),
}
# The banner above the onboarding text; its source is assets/bot/welcome.svg.
WELCOME_IMAGE = Path(__file__).parent / "assets" / "welcome.png"
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


def onboarding_text(lang: str, first_name: str | None) -> str:
    with_name, without_name = GREETING[lang]
    greeting = with_name.format(name=html.escape(first_name)) if first_name else without_name
    return ONBOARDING_TEXT[lang].format(greeting=greeting)


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

    welcome_photo: dict[str, str | None] = {"file_id": None}

    @dp.message(Command("start", "help"))
    async def start(message: Message) -> None:
        sender = message.from_user
        lang = (
            await language_for(sender.id, sender.language_code)
            if sender
            else effective_language(None, None)
        )
        sent = await message.answer_photo(
            welcome_photo["file_id"] or FSInputFile(WELCOME_IMAGE),
            caption=onboarding_text(lang, sender.first_name if sender else None),
            parse_mode=ParseMode.HTML,
            reply_markup=open_keyboard(settings.webapp_url, lang),
        )
        if sent and sent.photo:
            # Telegram keeps the uploaded banner: later sends reuse it instead of uploading again.
            welcome_photo["file_id"] = sent.photo[-1].file_id

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
