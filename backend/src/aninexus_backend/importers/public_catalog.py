from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import logging
import os
from collections.abc import Iterable, Iterator, Mapping
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, TextIO

from sqlalchemy.engine import Engine

from aninexus_backend.config import Settings
from aninexus_backend.db import Base, build_engine, ensure_mysql_database
from aninexus_backend.importers.search_manga import upsert_subjects
from aninexus_backend.models import Subject

LOGGER = logging.getLogger("aninexus.import.public_catalog")
FORMAT_NAME = "aninexus-public-catalog"
FORMAT_VERSION = 1
EXCLUDED_FIELDS = {"id", "created_at", "updated_at"}
PUBLIC_SUBJECT_FIELDS = {
    column.key for column in Subject.__table__.columns if column.key not in EXCLUDED_FIELDS
}


def _json_value(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def serialize_subject(record: Mapping[str, Any]) -> str:
    public_record = {
        key: _json_value(value)
        for key, value in record.items()
        if key in PUBLIC_SUBJECT_FIELDS
    }
    return json.dumps(public_record, ensure_ascii=False, separators=(",", ":"))


def deserialize_subject(line: str, line_number: int) -> dict[str, Any]:
    try:
        raw = json.loads(line)
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid JSON on catalog line {line_number}: {error.msg}") from error
    if not isinstance(raw, dict):
        raise ValueError(f"Catalog line {line_number} must contain a JSON object")

    unknown = set(raw).difference(PUBLIC_SUBJECT_FIELDS)
    if unknown:
        raise ValueError(
            f"Catalog line {line_number} contains unsupported fields: {', '.join(sorted(unknown))}"
        )
    required = {"source", "source_id", "subject_type", "name"}
    missing = required.difference(raw)
    if missing:
        raise ValueError(
            f"Catalog line {line_number} is missing fields: {', '.join(sorted(missing))}"
        )

    if raw.get("date"):
        raw["date"] = date.fromisoformat(raw["date"])
    if raw.get("source_updated_at"):
        raw["source_updated_at"] = datetime.fromisoformat(raw["source_updated_at"])
    if raw.get("score") is not None:
        raw["score"] = Decimal(str(raw["score"]))
    raw["source_id"] = str(raw["source_id"])
    raw["subject_type"] = int(raw["subject_type"])
    return raw


def write_public_bundle(
    destination: Path,
    batches: Iterable[list[dict[str, Any]]],
) -> tuple[int, str]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.tmp")
    count = 0
    header = {
        "_meta": {
            "format": FORMAT_NAME,
            "version": FORMAT_VERSION,
            "created_at": datetime.now(UTC).isoformat(),
            "contents": ["anime", "manga", "public_translations"],
            "excludes": ["users", "favorites", "chat_histories", "credentials"],
        }
    }

    try:
        with gzip.open(temporary, "wt", encoding="utf-8", newline="\n") as output:
            output.write(json.dumps(header, ensure_ascii=False, separators=(",", ":")) + "\n")
            for batch in batches:
                for record in batch:
                    output.write(serialize_subject(record) + "\n")
                    count += 1
        temporary.replace(destination)
    finally:
        if temporary.exists():
            temporary.unlink()

    return count, sha256_file(destination)


def _validate_header(stream: TextIO) -> None:
    first_line = stream.readline()
    if not first_line:
        raise ValueError("Public catalog bundle is empty")
    try:
        header = json.loads(first_line)
        metadata = header["_meta"]
    except (json.JSONDecodeError, KeyError, TypeError) as error:
        raise ValueError("Public catalog bundle has an invalid header") from error
    if metadata.get("format") != FORMAT_NAME or metadata.get("version") != FORMAT_VERSION:
        raise ValueError(
            f"Unsupported public catalog format: {metadata.get('format')!r} "
            f"version {metadata.get('version')!r}"
        )


def iter_public_bundle(source: Path, batch_size: int) -> Iterator[list[dict[str, Any]]]:
    with gzip.open(source, "rt", encoding="utf-8") as stream:
        _validate_header(stream)
        batch: list[dict[str, Any]] = []
        for line_number, line in enumerate(stream, start=2):
            if not line.strip():
                continue
            batch.append(deserialize_subject(line, line_number))
            if len(batch) >= batch_size:
                yield batch
                batch = []
        if batch:
            yield batch


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def import_public_bundle(
    source: Path,
    target_engine: Engine,
    batch_size: int,
    expected_sha256: str | None = None,
    dry_run: bool = False,
) -> int:
    if not source.is_file():
        raise FileNotFoundError(f"Public catalog bundle not found: {source}")
    if expected_sha256:
        actual = sha256_file(source)
        if actual.lower() != expected_sha256.lower():
            raise ValueError(f"Catalog checksum mismatch: expected {expected_sha256}, got {actual}")

    count = 0
    for batch in iter_public_bundle(source, batch_size):
        if not dry_run:
            with target_engine.begin() as connection:
                upsert_subjects(connection, batch)
        count += len(batch)
        LOGGER.info("processed %s public catalog records", count)
    return count


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="One-command import of an AniNexus public catalog bundle into MySQL."
    )
    parser.add_argument("--source", help="path to the .jsonl.gz public catalog bundle")
    parser.add_argument("--sha256", help="optional expected SHA-256 checksum")
    parser.add_argument("--batch-size", type=int, help="rows committed per transaction")
    parser.add_argument("--dry-run", action="store_true", help="validate without writing data")
    parser.add_argument(
        "--skip-create-database",
        action="store_true",
        help="require the configured target database to exist already",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    settings = Settings.from_environment()
    source = Path(args.source or settings.public_catalog_path)
    batch_size = args.batch_size or settings.import_batch_size
    if batch_size < 1:
        raise SystemExit("--batch-size must be greater than zero")
    if not settings.database_url:
        raise SystemExit("DATABASE_URL is required")

    if not args.dry_run and not args.skip_create_database:
        ensure_mysql_database(settings.database_url)
    target_engine = build_engine(settings.database_url)
    try:
        if not args.dry_run:
            Base.metadata.create_all(target_engine)
        count = import_public_bundle(
            source,
            target_engine,
            batch_size,
            expected_sha256=args.sha256 or os.getenv("PUBLIC_CATALOG_SHA256"),
            dry_run=args.dry_run,
        )
        LOGGER.info("Public catalog import complete: total=%s dry_run=%s", count, args.dry_run)
    finally:
        target_engine.dispose()


if __name__ == "__main__":
    main()
