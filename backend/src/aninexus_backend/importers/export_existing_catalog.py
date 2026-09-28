from __future__ import annotations

import argparse
import logging
import os
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import or_, select
from sqlalchemy.engine import URL, Engine

from aninexus_backend.db import build_engine
from aninexus_backend.importers.public_catalog import PUBLIC_SUBJECT_FIELDS, write_public_bundle
from aninexus_backend.models import Subject

LOGGER = logging.getLogger("aninexus.export.existing_catalog")


def iter_subject_batches(
    engine: Engine, batch_size: int, kind: str = "anime"
) -> Iterator[list[dict]]:
    if batch_size < 1:
        raise ValueError("batch_size must be greater than zero")
    if kind not in {"anime", "manga", "all"}:
        raise ValueError("kind must be anime, manga, or all")

    table = Subject.__table__
    columns = [column for column in table.columns if column.key in PUBLIC_SUBJECT_FIELDS]
    nsfw = table.c.metadata_json["nsfw"].as_boolean()
    last_id = 0
    with engine.connect() as connection:
        while True:
            statement = (
                select(table.c.id, *columns)
                .where(
                    table.c.id > last_id,
                    table.c.subject_type.in_((1, 2))
                    if kind == "all"
                    else table.c.subject_type == (2 if kind == "anime" else 1),
                    or_(table.c.metadata_json.is_(None), nsfw.is_(None), nsfw.is_(False)),
                )
                .order_by(table.c.id)
                .limit(batch_size)
            )
            rows = connection.execute(statement).mappings().all()
            if not rows:
                break
            last_id = rows[-1]["id"]
            yield [{key: value for key, value in row.items() if key != "id"} for row in rows]


def iter_anime_batches(engine: Engine, batch_size: int) -> Iterator[list[dict]]:
    yield from iter_subject_batches(engine, batch_size, "anime")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Export anime or manga records from an existing AniNexus database "
            "without private data."
        )
    )
    parser.add_argument("--output", required=True, help="destination .jsonl.gz catalog bundle")
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument("--kind", choices=("anime", "manga", "all"), default="anime")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if args.batch_size < 1:
        raise SystemExit("--batch-size must be greater than zero")

    password = os.getenv("ANINEXUS_SOURCE_DB_PASSWORD")
    if not password:
        raise SystemExit("ANINEXUS_SOURCE_DB_PASSWORD is required")
    url = URL.create(
        "mysql+pymysql",
        username=os.getenv("ANINEXUS_SOURCE_DB_USER", "root"),
        password=password,
        host=os.getenv("ANINEXUS_SOURCE_DB_HOST", "127.0.0.1"),
        port=int(os.getenv("ANINEXUS_SOURCE_DB_PORT", "3306")),
        database=os.getenv("ANINEXUS_SOURCE_DB_NAME", "aninexus"),
    )
    engine = build_engine(url)
    try:
        count, checksum = write_public_bundle(
            Path(args.output), iter_subject_batches(engine, args.batch_size, args.kind)
        )
        LOGGER.info("%s export complete: records=%s sha256=%s", args.kind, count, checksum)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
