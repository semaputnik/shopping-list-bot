# SQLite as the database engine, behind SQLAlchemy

The backend stores everything in SQLite through SQLAlchemy 2. The product is a small, family-scale app run by one person: one process, one file, no database server to provision, back up or pay for. The same engine serves production and the automated tests, which run against a real database file created per test, so the HTTP API test seam exercises real SQL, constraints and transactions rather than a fake.

SQLAlchemy keeps the door open: moving to PostgreSQL later means changing `SL_DATABASE_URL` and adding migrations, not rewriting queries. We avoid SQLite-only features in application code. Foreign keys are enforced (`PRAGMA foreign_keys=ON`) and the journal runs in WAL mode so readers (the SSE stream, catch-up) do not block the single writer.

Considered and rejected for now: PostgreSQL (better concurrent writes, but an extra service for a workload of a few writers per List, and tests would need a server), and an in-memory fake (would not catch constraint or transaction bugs).

Consequences:
- Schema is created with `Base.metadata.create_all` at startup. Introduce Alembic migrations before the first deployment that holds data worth keeping.
- Writes are serialized by SQLite. If concurrent write contention becomes real, switch to PostgreSQL.
