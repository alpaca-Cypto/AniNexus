from __future__ import annotations

import argparse
import json
import logging
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, TextIO

from aninexus_backend.importers.public_catalog import write_public_bundle

LOGGER = logging.getLogger("aninexus.import.bangumi_archive")
SUBJECT_FILE = "subject.jsonlines"
SUBJECT_TYPES = {"anime": {2}, "books": {1}, "all": {1, 2}}


@dataclass(slots=True)
class ArchiveReport:
    scanned: int = 0
    accepted: int = 0
    skipped_type: int = 0
    skipped_nsfw: int = 0
    checksum: str | None = None


def _parse_optional_date(value: Any, line_number: int) -> date | None:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value))
    except ValueError as error:
        raise ValueError(f"Invalid date on Bangumi archive line {line_number}") from error


def _parse_optional_score(value: Any, line_number: int) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError) as error:
        raise ValueError(f"Invalid score on Bangumi archive line {line_number}") from error


def _tag_names(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [
        name
        for item in value
        if isinstance(item, Mapping)
        and isinstance(name := item.get("name"), str)
        and name.strip()
    ]


def _metadata(raw: Mapping[str, Any]) -> dict[str, Any]:
    favorite = raw.get("favorite") if isinstance(raw.get("favorite"), Mapping) else {}
    tag_counts = {
        item["name"]: item.get("count", 0)
        for item in raw.get("tags", [])
        if isinstance(item, Mapping) and isinstance(item.get("name"), str)
    }
    values = {
        "nsfw": bool(raw.get("nsfw", False)),
        "series": bool(raw.get("series", False)),
        "infobox": raw.get("infobox"),
        "meta_tags": raw.get("meta_tags"),
        "score_details": raw.get("score_details"),
        "favorite": dict(favorite),
        "favorite_total": sum(
            int(count) for count in favorite.values() if isinstance(count, int | float)
        ),
        "tag_counts": tag_counts,
    }
    return {key: value for key, value in values.items() if value not in (None, [], {}, "")}


def transform_archive_subject(
    raw: Mapping[str, Any],
    line_number: int,
    source_updated_at: datetime,
) -> dict[str, Any]:
    try:
        source_id = str(int(raw["id"]))
        subject_type = int(raw["type"])
        name = raw["name"]
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError(
            f"Bangumi archive line {line_number} is missing a valid id, type, or name"
        ) from error
    if not isinstance(name, str) or not name.strip():
        raise ValueError(f"Bangumi archive line {line_number} has an empty name")

    return {
        "source": "bangumi",
        "source_id": source_id,
        "subject_type": subject_type,
        "name": name.strip(),
        "name_cn": str(raw["name_cn"]).strip() if raw.get("name_cn") else None,
        "summary": str(raw["summary"]).strip() if raw.get("summary") else None,
        "date": _parse_optional_date(raw.get("date"), line_number),
        "platform": str(raw["platform"]) if raw.get("platform") is not None else None,
        "score": _parse_optional_score(raw.get("score"), line_number),
        "rank": int(raw["rank"]) if raw.get("rank") is not None else None,
        "tags": _tag_names(raw.get("tags")),
        "metadata_json": _metadata(raw),
        "source_updated_at": source_updated_at,
    }


def _read_record(stream: TextIO, line_number: int, line: str) -> Mapping[str, Any]:
    try:
        raw = json.loads(line)
    except json.JSONDecodeError as error:
        raise ValueError(
            f"Invalid JSON on Bangumi archive line {line_number}: {error.msg}"
        ) from error
    if not isinstance(raw, Mapping):
        raise ValueError(f"Bangumi archive line {line_number} must contain a JSON object")
    return raw


def iter_archive_batches(
    source: Path,
    report: ArchiveReport,
    subject_types: set[int],
    batch_size: int,
    limit: int | None = None,
    include_nsfw: bool = False,
) -> Iterator[list[dict[str, Any]]]:
    if batch_size < 1:
        raise ValueError("batch_size must be greater than zero")
    if limit is not None and limit < 1:
        raise ValueError("limit must be greater than zero")
    if not source.is_file():
        raise FileNotFoundError(f"Bangumi subject archive not found: {source}")

    source_updated_at = datetime.fromtimestamp(source.stat().st_mtime, UTC).replace(tzinfo=None)
    batch: list[dict[str, Any]] = []
    with source.open("r", encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, start=1):
            if not line.strip():
                continue
            report.scanned += 1
            raw = _read_record(stream, line_number, line)
            if raw.get("type") not in subject_types:
                report.skipped_type += 1
                continue
            if raw.get("nsfw") is True and not include_nsfw:
                report.skipped_nsfw += 1
                continue
            batch.append(transform_archive_subject(raw, line_number, source_updated_at))
            report.accepted += 1
            if len(batch) >= batch_size:
                yield batch
                batch = []
            if limit is not None and report.accepted >= limit:
                break
    if batch:
        yield batch


def convert_archive(
    archive_dir: Path,
    output: Path | None,
    kind: str = "anime",
    batch_size: int = 1000,
    limit: int | None = None,
    include_nsfw: bool = False,
) -> ArchiveReport:
    if kind not in SUBJECT_TYPES:
        raise ValueError(f"Unsupported Bangumi archive kind: {kind}")
    report = ArchiveReport()
    batches = iter_archive_batches(
        archive_dir / SUBJECT_FILE,
        report,
        SUBJECT_TYPES[kind],
        batch_size,
        limit,
        include_nsfw,
    )
    if output is None:
        for _batch in batches:
            pass
    else:
        _count, report.checksum = write_public_bundle(output, batches)
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate or convert a Bangumi Archive into an AniNexus public catalog."
    )
    parser.add_argument("archive_dir", help="directory containing subject.jsonlines")
    parser.add_argument("--output", help="destination AniNexus .jsonl.gz bundle")
    parser.add_argument("--kind", choices=tuple(SUBJECT_TYPES), default="anime")
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--include-nsfw", action="store_true")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    report = convert_archive(
        Path(args.archive_dir),
        Path(args.output) if args.output else None,
        kind=args.kind,
        batch_size=args.batch_size,
        limit=args.limit,
        include_nsfw=args.include_nsfw,
    )
    LOGGER.info(
        "Bangumi Archive complete: scanned=%s accepted=%s skipped_type=%s "
        "skipped_nsfw=%s output=%s sha256=%s",
        report.scanned,
        report.accepted,
        report.skipped_type,
        report.skipped_nsfw,
        args.output or "dry-run",
        report.checksum or "n/a",
    )


if __name__ == "__main__":
    main()
