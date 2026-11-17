import sys


def main() -> None:
    """Console entry point: ``serve`` (default), ``bot`` or ``migrate``."""
    command = sys.argv[1] if len(sys.argv) > 1 else "serve"
    if command == "serve":
        import uvicorn

        uvicorn.run("shopping_list_bot.app:create_app", factory=True, host="0.0.0.0", port=8000)
    elif command == "bot":
        from .bot import main as bot_main

        bot_main()
    elif command == "migrate":
        from .config import Settings
        from .migrate import upgrade

        upgrade(Settings().database_url)
    else:
        raise SystemExit("usage: shopping-list-bot [serve|bot|migrate]")
