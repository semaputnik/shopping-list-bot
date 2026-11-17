from alembic import context
from sqlalchemy import create_engine

from shopping_list_bot import models  # noqa: F401  (registers the tables on Base.metadata)
from shopping_list_bot.db import Base

config = context.config


def run_migrations() -> None:
    engine = create_engine(config.attributes["database_url"])
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


run_migrations()
