# Postgres as the database engine, with Alembic migrations

The backend and the bot store everything in PostgreSQL 18 through psycopg 3 and synchronous SQLAlchemy 2. The schema is owned by Alembic migrations in `src/shopping_list_bot/migrations/`, applied by `shopping-list-bot migrate`. This supersedes [ADR 0003](0003-sqlite-database.md).

SQLite served the MVP, but the plan it left open is now due: the database holds live data, and the schema was already changing through ad-hoc column patches. Postgres gives real concurrent writers, a proper migration path and the features the next iteration needs (JSONB, CHECK constraints, partial indexes).

- **Migrations replace `create_all`.** The app does not touch the schema. At startup it checks that the database is at the newest Alembic revision and, if not, logs an error and refuses to start. `migrate` runs first, as a one-shot (a compose service in dev).
- **List mutations take a row lock.** Every mutation selects the List row `FOR UPDATE` before writing and bumping `version`, so concurrent writers of one List queue up and `version` stays unique and consecutive. The lock is taken first, before any child row is inserted: an insert takes a weaker lock on the List that cannot be upgraded while another writer waits, which deadlocks.
- **Tests run on Postgres only.** Locally a testcontainers `postgres:18` serves the suite; CI uses a `postgres:18` service container (`SL_TEST_POSTGRES_URL`). A migrated template database is created once, and each test gets a copy. There is no SQLite fallback, so SQL, constraints, locking and transactions are tested as they run in production.
- **Time values are timezone-aware.** Postgres returns `timestamptz` as aware datetimes, so the SQLite-era helpers that patched naive values are gone.

Consequence: running the app or the tests needs a Postgres server (Docker is enough). Carrying existing SQLite data over is a one-off task handled separately; the SQLite file stays as the backup.
