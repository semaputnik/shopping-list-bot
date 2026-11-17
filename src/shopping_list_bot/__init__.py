import sys


def main() -> None:
    """Console entry point: ``serve`` (default), ``bot``, ``migrate`` or ``import-sqlite <path>``."""
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
    elif command == "import-sqlite" and len(sys.argv) == 3:
        from pathlib import Path

        from .config import Settings
        from .importer import import_sqlite

        try:
            counts = import_sqlite(Path(sys.argv[2]), Settings().database_url)
        except RuntimeError as error:
            raise SystemExit(str(error)) from error
        for table, (source, target) in counts.items():
            print(f"{table}: source {source}, target {target}")
    else:
        raise SystemExit("usage: shopping-list-bot [serve|bot|migrate|import-sqlite <path>]")
