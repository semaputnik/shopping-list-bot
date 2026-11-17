"""One-shot copy of the MVP's SQLite database into a migrated, empty Postgres database."""

import json
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import MetaData, Table, create_engine, func, select, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Connection

from . import models  # noqa: F401  (registers the tables on Base.metadata)
from .db import Base

BATCH = 1000


def _convert(value, column):
    """Naive SQLite datetimes are UTC; notification.items is TEXT there and JSONB here."""
    if isinstance(value, datetime) and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    if isinstance(column.type, JSONB) and isinstance(value, str):
        return json.loads(value)
    return value


def _copy(source: Connection, target: Connection, table: Table) -> None:
    src = Table(table.name, MetaData(), autoload_with=source)
    columns = [c for c in table.columns if c.name in src.columns]
    rows = source.execute(select(*(src.c[c.name] for c in columns))).mappings()
    while batch := rows.fetchmany(BATCH):
        target.execute(
            table.insert(),
            [{c.name: _convert(row[c.name], c) for c in columns} for row in batch],
        )
    # Ids were copied, so the identity sequence has not moved: put it past the largest id.
    target.execute(
        text(
            "SELECT setval(pg_get_serial_sequence(:table, 'id'), "
            f'COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM "{table.name}"'
        ),
        {"table": f'"{table.name}"'},
    )


def import_sqlite(sqlite_path: Path, database_url: str) -> dict[str, tuple[int, int]]:
    """Copy every table in one transaction; returns ``{table: (source rows, target rows)}``.

    Raises ``RuntimeError`` (and changes nothing) when the source file is missing, the target
    already holds data, or a table's row counts differ after the copy.
    """
    if not sqlite_path.is_file():
        raise RuntimeError(f"SQLite file not found: {sqlite_path}")
    source_engine = create_engine(f"sqlite:///file:{sqlite_path}?mode=ro&uri=true")
    target_engine = create_engine(database_url)
    try:
        with source_engine.connect() as source, target_engine.begin() as target:
            present = {
                name
                for (name,) in source.execute(
                    text("SELECT name FROM sqlite_master WHERE type = 'table'")
                )
            }
            tables = [t for t in Base.metadata.sorted_tables if t.name in present]
            unknown = present - {t.name for t in Base.metadata.sorted_tables}
            if unknown:
                raise RuntimeError(f"Source has tables the schema does not know: {sorted(unknown)}")
            for table in Base.metadata.sorted_tables:
                if target.execute(select(func.count()).select_from(table)).scalar_one():
                    raise RuntimeError(f"Target database is not empty ({table.name} has rows)")

            counts = {}
            for table in tables:
                _copy(source, target, table)
                counts[table.name] = tuple(
                    conn.execute(select(func.count()).select_from(table)).scalar_one()
                    for conn in (source, target)
                )
            mismatched = [name for name, (src, dst) in counts.items() if src != dst]
            if mismatched:
                raise RuntimeError(f"Row counts differ after the copy: {mismatched}")
            return counts
    finally:
        source_engine.dispose()
        target_engine.dispose()
