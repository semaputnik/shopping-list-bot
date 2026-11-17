"""The bot's onboarding: /start and /help text per language, description and commands.

The bot has no HTTP surface, so the seam is aiogram's own: a real Dispatcher fed a Telegram
update, and a Bot whose session records the Bot API calls instead of sending them.
"""

import asyncio
from datetime import datetime

import pytest
from aiogram import Bot
from aiogram.client.session.base import BaseSession
from aiogram.methods import SendPhoto, SetMyCommands, SetMyDescription, SetMyShortDescription
from aiogram.types import Chat, Message, Update, User

from shopping_list_bot.bot import build_dispatcher, configure_bot
from shopping_list_bot.config import Settings

WEBAPP_URL = "https://lists.example.test/"


class RecordingSession(BaseSession):
    def __init__(self) -> None:
        super().__init__()
        self.calls: list = []

    async def __call__(self, bot, method, timeout=None):
        self.calls.append(method)

    async def make_request(self, bot, method, timeout=None):
        raise NotImplementedError

    async def stream_content(self, *args, **kwargs):
        raise NotImplementedError

    async def close(self) -> None:
        return None


def make_bot() -> tuple[Bot, RecordingSession]:
    session = RecordingSession()
    return Bot("123456:TEST-bot-token-not-real", session=session), session


def send_command(
    database_url: str, command: str, language_code: str | None, first_name: str = "Anna"
) -> SendPhoto:
    settings = Settings(database_url=database_url, webapp_url=WEBAPP_URL, _env_file=None)
    bot, session = make_bot()
    user = User(id=1001, is_bot=False, first_name=first_name, language_code=language_code)
    message = Message(
        message_id=1,
        date=datetime.now(),
        chat=Chat(id=1001, type="private"),
        from_user=user,
        text=command,
        entities=[{"type": "bot_command", "offset": 0, "length": len(command)}],
    )
    asyncio.run(build_dispatcher(settings).feed_update(bot, Update(update_id=1, message=message)))
    (sent,) = session.calls
    return sent


@pytest.mark.parametrize("command", ["/start", "/help"])
@pytest.mark.parametrize(
    ("language_code", "greeting", "bought"),
    [
        ("ru", "<b>Привет, Anna! 👋</b>", "<b>«Куплено»</b>"),
        ("es-MX", "<b>¡Hola, Anna! 👋</b>", "<b>«Comprado»</b>"),
        ("en", "<b>Hi, Anna! 👋</b>", "<b>“Bought”</b>"),
        ("de", "<b>Hi, Anna! 👋</b>", "<b>“Bought”</b>"),
        (None, "<b>Hi, Anna! 👋</b>", "<b>“Bought”</b>"),
    ],
)
def test_start_and_help_send_the_banner_with_the_steps_in_the_users_language(
    database_url, command, language_code, greeting, bought
):
    sent = send_command(database_url, command, language_code)
    assert isinstance(sent, SendPhoto)
    assert sent.parse_mode == "HTML"
    assert sent.caption.startswith(greeting)
    assert bought in sent.caption
    assert len(sent.caption) <= 1024
    steps = [line[:1] for line in sent.caption.splitlines() if line and line[0] in "🛒👆✅👨"]
    assert steps == ["🛒", "👆", "✅", "👨"]
    (button,) = sent.reply_markup.inline_keyboard[0]
    assert button.web_app.url == WEBAPP_URL


def test_the_users_name_is_escaped_in_the_greeting(database_url):
    sent = send_command(database_url, "/start", "en", first_name="<Bob & Co>")
    assert sent.caption.startswith("<b>Hi, &lt;Bob &amp; Co&gt;! 👋</b>")


def test_start_button_is_labelled_in_the_users_language(database_url):
    sent = send_command(database_url, "/start", "ru")
    assert sent.reply_markup.inline_keyboard[0][0].text == "Открыть список"


def test_startup_sets_descriptions_and_commands_for_every_language_and_a_default():
    bot, session = make_bot()
    asyncio.run(configure_bot(bot))

    def by_language(method_type):
        return {m.language_code: m for m in session.calls if isinstance(m, method_type)}

    for method_type, text_field, limit in [
        (SetMyDescription, "description", 512),
        (SetMyShortDescription, "short_description", 120),
    ]:
        methods = by_language(method_type)
        assert set(methods) == {None, "ru", "es", "en"}
        texts = {code: getattr(m, text_field) for code, m in methods.items()}
        assert all(0 < len(t) <= limit for t in texts.values())
        assert texts[None] == texts["en"]
        assert len(set(texts.values())) == 3

    commands = by_language(SetMyCommands)
    assert set(commands) == {None, "ru", "es", "en"}
    for method in commands.values():
        assert [c.command for c in method.commands] == ["start", "help"]
    assert commands["ru"].commands[1].description != commands["en"].commands[1].description
