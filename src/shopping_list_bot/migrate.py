"""Schema management: Alembic migrations live in ``migrations/`` inside the package."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy.engine import Engine

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def _config(database_url: str) -> Config:
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.attributes["database_url"] = database_url
    return config


def upgrade(database_url: str, revision: str = "head") -> None:
    """Apply the migrations the database has not seen yet, up to ``revision`` (default: all)."""
    command.upgrade(_config(database_url), revision)


def downgrade(database_url: str, revision: str) -> None:
    """Undo migrations back to ``revision``."""
    command.downgrade(_config(database_url), revision)


def is_current(engine: Engine) -> bool:
    """True when the database is at the newest migration."""
    head = ScriptDirectory.from_config(_config("")).get_current_head()
    with engine.connect() as conn:
        return MigrationContext.configure(conn).get_current_revision() == head
