from __future__ import annotations

import argparse
import logging
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from sqlalchemy import MetaData, Table, func, inspect, select
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.engine import Connection, Engine

from aninexus_backend.config import Settings
from aninexus_backend.db import Base, build_engine, ensure_mysql_database
from aninexus_backend.models import Subject

LOGGER = logging.getLogger("aninexus.import.search_manga")
CatalogKind = Literal["anime", "manga"]


@dataclass(frozen=True, slots=True)
class ImportResult:
    anime: int = 0
    manga: int = 0

    @property
    def total(self) -> int:
        return self.anime + self.manga


def split_pipe_values(value: Any) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in str(value).split("|") if part.strip()]


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError, OverflowError):
        return None


def _optional_score(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, TypeError):
        return None


def transform_legacy_row(kind: CatalogKind, row: Mapping[str, Any]) -> dict[str, Any]:
    """Convert a search_manga row into the normalized AniNexus subject shape."""

    is_anime = kind == "anime"
    date_value = row.get("aired_from") if is_anime else row.get("published_from")
    metadata = {
        "source": row.get("source") if is_anime else None,
        "duration": row.get("duration") if is_anime else None,
        "rating": row.get("rating") if is_anime else None,
        "studios": split_pipe_values(row.get("studios")) if is_anime else [],
        "producers": split_pipe_values(row.get("producers")) if is_anime else [],
        "authors": split_pipe_values(row.get("authors")) if not is_anime else [],
        "serializations": split_pipe_values(row.get("serializations")) if not is_anime else [],
        "themes": split_pipe_values(row.get("themes")),
        "demographics": split_pipe_values(row.get("demographics")),
    }
    metadata = {key: value for key, value in metadata.items() if value not in (None, [], "")}

    return {
        "source": "myanimelist",
        "source_id": str(row["mal_id"]),
        "subject_type": 2 if is_anime else 1,
        "name": row["title"],
        "name_cn": row.get("translation_title_zh"),
        "title_english": row.get("title_english"),
        "title_japanese": row.get("title_japanese"),
        "summary": row.get("translation_synopsis_zh") or row.get("synopsis"),
        "date": date_value,
        "platform": row.get("type"),
        "status": row.get("status"),
        "eps": _optional_int(row.get("episodes")) if is_anime else None,
        "volumes": _optional_int(row.get("volumes")) if not is_anime else None,
        "image": row.get("image_url"),
        "score": _optional_score(row.get("score")),
        "rank": _optional_int(row.get("rank")),
        "popularity": _optional_int(row.get("popularity")),
        "tags": split_pipe_values(row.get("genres")),
        "metadata_json": metadata or None,
    }


def upsert_subjects(connection: Connection, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return

    statement = mysql_insert(Subject.__table__).values(rows)
    provided_fields = set(rows[0])
    update_columns = {
        field: statement.inserted[field]
        for field in provided_fields
        if field not in {"id", "source", "source_id", "subject_type", "created_at", "updated_at"}
    }
    update_columns["updated_at"] = func.now()
    connection.execute(statement.on_duplicate_key_update(**update_columns))


def _reflect_legacy_table(engine: Engine, kind: CatalogKind) -> Table:
    table = Table(kind, MetaData(), autoload_with=engine)
    required = {"mal_id", "title", "score", "genres", "synopsis", "image_url"}
    missing = sorted(required.difference(table.columns.keys()))
    if missing:
        raise RuntimeError(f"Legacy table {kind!r} is missing columns: {', '.join(missing)}")
    return table


def _reflect_translation_table(engine: Engine) -> Table | None:
    if not inspect(engine).has_table("detail_translations"):
        return None
    table = Table("detail_translations", MetaData(), autoload_with=engine)
    required = {"mal_id", "content_type", "title_zh", "synopsis_zh"}
    return table if required.issubset(table.columns.keys()) else None


def _iter_batches(
    connection: Connection,
    table: Table,
    translations: Table | None,
    kind: CatalogKind,
    batch_size: int,
    limit: int | None,
) -> Iterable[list[Mapping[str, Any]]]:
    imported = 0
    last_id = -1

    while limit is None or imported < limit:
        current_size = batch_size if limit is None else min(batch_size, limit - imported)
        if translations is None:
            selected = select(table)
        else:
            selected = select(
                table,
                translations.c.title_zh.label("translation_title_zh"),
                translations.c.synopsis_zh.label("translation_synopsis_zh"),
            ).outerjoin(
                translations,
                (translations.c.mal_id == table.c.mal_id)
                & (translations.c.content_type == kind),
            )
        statement = (
            selected
            .where(table.c.mal_id > last_id)
            .order_by(table.c.mal_id)
            .limit(current_size)
        )
        rows = list(connection.execute(statement).mappings())
        if not rows:
            break
        yield rows
        imported += len(rows)
        last_id = int(rows[-1]["mal_id"])


def iter_transformed_catalog(
    legacy_engine: Engine,
    kinds: tuple[CatalogKind, ...],
    batch_size: int,
    limit: int | None = None,
) -> Iterable[tuple[CatalogKind, list[dict[str, Any]]]]:
    """Yield normalized public catalog batches without any user-owned data."""

    translations = _reflect_translation_table(legacy_engine)
    for kind in kinds:
        table = _reflect_legacy_table(legacy_engine, kind)
        with legacy_engine.connect() as source_connection:
            for source_rows in _iter_batches(
                source_connection,
                table,
                translations,
                kind,
                batch_size,
                limit,
            ):
                yield kind, [transform_legacy_row(kind, row) for row in source_rows]


def import_catalog(
    legacy_engine: Engine,
    target_engine: Engine | None,
    kinds: tuple[CatalogKind, ...],
    batch_size: int,
    limit: int | None = None,
    dry_run: bool = False,
) -> ImportResult:
    counts: dict[CatalogKind, int] = {"anime": 0, "manga": 0}
    for kind, transformed in iter_transformed_catalog(
        legacy_engine,
        kinds,
        batch_size,
        limit,
    ):
        if not dry_run:
            if target_engine is None:
                raise ValueError("target_engine is required unless dry_run is enabled")
            with target_engine.begin() as target_connection:
                upsert_subjects(target_connection, transformed)
        counts[kind] += len(transformed)
        LOGGER.info("%s: processed %s rows", kind, counts[kind])

    return ImportResult(anime=counts["anime"], manga=counts["manga"])


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Import the optional search_manga MySQL catalog into AniNexus."
    )
    parser.add_argument(
        "--kind",
        choices=("all", "anime", "manga"),
        default="all",
        help="catalog section to import (default: all)",
    )
    parser.add_argument("--batch-size", type=int, help="rows committed per transaction")
    parser.add_argument("--limit", type=int, help="maximum rows per selected table")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="read and transform records without creating or writing the target database",
    )
    parser.add_argument(
        "--skip-create-database",
        action="store_true",
        help="do not run CREATE DATABASE IF NOT EXISTS before importing",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    settings = Settings.from_environment()

    if not settings.legacy_database_url:
        raise SystemExit(
            "LEGACY_DATABASE_URL is not configured. Copy backend/.env.example to "
            "backend/.env and point it at the optional anime_explorer database."
        )
    if args.batch_size is not None and args.batch_size < 1:
        raise SystemExit("--batch-size must be greater than zero")
    if args.limit is not None and args.limit < 1:
        raise SystemExit("--limit must be greater than zero")

    kinds: tuple[CatalogKind, ...] = (
        ("anime", "manga") if args.kind == "all" else (args.kind,)
    )
    legacy_engine = build_engine(settings.legacy_database_url)
    target_engine: Engine | None = None

    try:
        if not args.dry_run:
            if not settings.database_url:
                raise SystemExit("DATABASE_URL is required unless --dry-run is used")
            if not args.skip_create_database:
                ensure_mysql_database(settings.database_url)
            target_engine = build_engine(settings.database_url)
            Base.metadata.create_all(target_engine)

        result = import_catalog(
            legacy_engine=legacy_engine,
            target_engine=target_engine,
            kinds=kinds,
            batch_size=args.batch_size or settings.import_batch_size,
            limit=args.limit,
            dry_run=args.dry_run,
        )
        LOGGER.info(
            "Import complete: anime=%s manga=%s total=%s dry_run=%s",
            result.anime,
            result.manga,
            result.total,
            args.dry_run,
        )
    finally:
        legacy_engine.dispose()
        if target_engine is not None:
            target_engine.dispose()


if __name__ == "__main__":
    main()
