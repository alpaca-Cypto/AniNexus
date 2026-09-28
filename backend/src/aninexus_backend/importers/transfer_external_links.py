from __future__ import annotations

import argparse
import gzip
import json
import logging
import os
from datetime import datetime
from pathlib import Path

from sqlalchemy import select, tuple_
from sqlalchemy.engine import URL, Engine

from aninexus_backend.config import Settings
from aninexus_backend.db import build_engine
from aninexus_backend.importers.external_ids import link_subject_external_ids
from aninexus_backend.importers.public_catalog import sha256_file
from aninexus_backend.models import Subject, SubjectExternalId

LOGGER = logging.getLogger("aninexus.import.external_links")
FORMAT = "aninexus-anime-external-links"
FIELDS = {"source", "source_id", "provider", "external_id", "subject_type", "provider_updated_at"}


def export_links(engine: Engine, output: Path) -> tuple[int, str]:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f".{output.name}.tmp")
    count = 0
    try:
        with (
            engine.connect() as connection,
            gzip.open(temporary, "wt", encoding="utf-8", newline="\n") as stream,
        ):
            stream.write(json.dumps({"_meta": {"format": FORMAT, "version": 1}}) + "\n")
            statement = (
                select(
                    Subject.source,
                    Subject.source_id,
                    SubjectExternalId.provider,
                    SubjectExternalId.external_id,
                    SubjectExternalId.subject_type,
                    SubjectExternalId.provider_updated_at,
                )
                .join(Subject, Subject.id == SubjectExternalId.subject_id)
                .where(Subject.subject_type == 2, SubjectExternalId.subject_type == 2)
                .order_by(SubjectExternalId.id)
            )
            for row in connection.execute(statement).mappings():
                record = dict(row)
                if (record["source"], record["source_id"]) == (
                    record["provider"],
                    record["external_id"],
                ):
                    continue
                if record["provider_updated_at"] is not None:
                    record["provider_updated_at"] = record["provider_updated_at"].isoformat()
                stream.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
                count += 1
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    return count, sha256_file(output)


def read_links(source: Path) -> list[dict]:
    with gzip.open(source, "rt", encoding="utf-8") as stream:
        try:
            header = json.loads(stream.readline())
        except (ValueError, TypeError) as error:
            raise ValueError("Invalid external-link bundle header") from error
        if header.get("_meta") != {"format": FORMAT, "version": 1}:
            raise ValueError("Unsupported external-link bundle")
        records = []
        identities: dict[tuple[str, str, int], tuple[str, str, int]] = {}
        for line_number, line in enumerate(stream, start=2):
            record = json.loads(line)
            if not isinstance(record, dict) or set(record) != FIELDS:
                raise ValueError(f"Invalid external-link fields on line {line_number}")
            if record["subject_type"] != 2:
                raise ValueError(f"Non-anime external link on line {line_number}")
            key = (record["provider"], record["external_id"], 2)
            target = (record["source"], record["source_id"], 2)
            if key in identities and identities[key] != target:
                raise ValueError(f"Conflicting external link on line {line_number}")
            identities[key] = target
            if record["provider_updated_at"] is not None:
                record["provider_updated_at"] = datetime.fromisoformat(
                    record["provider_updated_at"]
                )
            records.append(record)
    return records


def import_links(engine: Engine, records: list[dict], dry_run: bool = False) -> int:
    table = Subject.__table__
    external = SubjectExternalId.__table__
    source_keys = {(r["source"], r["source_id"], 2) for r in records}
    provider_keys = {(r["provider"], r["external_id"], 2) for r in records}
    with engine.begin() as connection:
        subjects = {
            (row.source, row.source_id, row.subject_type): row.id
            for row in connection.execute(
                select(table.c.id, table.c.source, table.c.source_id, table.c.subject_type).where(
                    tuple_(table.c.source, table.c.source_id, table.c.subject_type).in_(source_keys)
                )
            )
        }
        if len(subjects) != len(source_keys):
            raise ValueError(f"Missing {len(source_keys) - len(subjects)} target subjects")
        existing = {
            (row.provider, row.external_id, row.subject_type): row.subject_id
            for row in connection.execute(
                select(
                    external.c.provider,
                    external.c.external_id,
                    external.c.subject_type,
                    external.c.subject_id,
                ).where(
                    tuple_(
                        external.c.provider, external.c.external_id, external.c.subject_type
                    ).in_(provider_keys)
                )
            )
        }
        for record in records:
            key = (record["provider"], record["external_id"], 2)
            target_id = subjects[(record["source"], record["source_id"], 2)]
            if key in existing and existing[key] != target_id:
                raise ValueError(f"External link already points to another subject: {key}")
        if not dry_run:
            for start in range(0, len(records), 500):
                batch = records[start : start + 500]
                link_subject_external_ids(
                    connection,
                    [
                        (
                            subjects[(r["source"], r["source_id"], 2)],
                            {
                                "source": r["provider"],
                                "source_id": r["external_id"],
                                "subject_type": 2,
                                "source_updated_at": r["provider_updated_at"],
                            },
                        )
                        for r in batch
                    ],
                )
    return len(records)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Transfer public anime provider IDs by stable subject identity."
    )
    actions = parser.add_subparsers(dest="action", required=True)
    export = actions.add_parser("export")
    export.add_argument("--output", required=True)
    apply = actions.add_parser("import")
    apply.add_argument("--source", required=True)
    apply.add_argument("--sha256", required=True)
    apply.add_argument("--dry-run", action="store_true")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if args.action == "export":
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
            count, checksum = export_links(engine, Path(args.output))
            LOGGER.info("External-link export complete: records=%s sha256=%s", count, checksum)
        finally:
            engine.dispose()
    else:
        source = Path(args.source)
        if sha256_file(source).lower() != args.sha256.lower():
            raise SystemExit("External-link bundle checksum mismatch")
        records = read_links(source)
        settings = Settings.from_environment()
        if not settings.database_url:
            raise SystemExit("DATABASE_URL is required")
        engine = build_engine(settings.database_url)
        try:
            count = import_links(engine, records, args.dry_run)
            LOGGER.info("External-link import complete: records=%s dry_run=%s", count, args.dry_run)
        finally:
            engine.dispose()


if __name__ == "__main__":
    main()
