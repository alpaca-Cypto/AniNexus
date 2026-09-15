from __future__ import annotations

import argparse
import json
import logging
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

from sqlalchemy.engine import Connection

from aninexus_backend.config import Settings
from aninexus_backend.db import build_engine
from aninexus_backend.importers.bangumi_archive import ArchiveReport, iter_archive_batches
from aninexus_backend.importers.external_ids import link_subject_external_ids

LOGGER = logging.getLogger("aninexus.import.apply_bangumi_matches")


def load_auto_links(plan_path: Path) -> dict[str, int]:
    links: dict[str, int] = {}
    with plan_path.open("r", encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, start=1):
            if not line.strip():
                continue
            try:
                decision = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"Invalid match plan JSON on line {line_number}") from error
            if decision.get("status") != "auto_link":
                continue
            bangumi_id = str(decision.get("bangumi_id", ""))
            subject_id = decision.get("subject_id")
            if not bangumi_id or not isinstance(subject_id, int):
                raise ValueError(f"Invalid auto_link decision on line {line_number}")
            if bangumi_id in links:
                raise ValueError(f"Duplicate Bangumi ID in match plan: {bangumi_id}")
            links[bangumi_id] = subject_id
    return links


def apply_auto_links(
    connection: Connection,
    batches: Iterable[list[Mapping[str, Any]]],
    auto_links: Mapping[str, int],
    *,
    dry_run: bool,
) -> int:
    applied = 0
    seen: set[str] = set()
    for batch in batches:
        links = []
        for record in batch:
            bangumi_id = str(record["source_id"])
            if subject_id := auto_links.get(bangumi_id):
                links.append((subject_id, record))
                seen.add(bangumi_id)
        if not dry_run:
            applied += link_subject_external_ids(connection, links)
        else:
            applied += len(links)

    missing = set(auto_links).difference(seen)
    if missing:
        sample = ", ".join(sorted(missing)[:5])
        raise ValueError(f"Match plan references {len(missing)} missing archive records: {sample}")
    return applied


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Apply only reviewed auto_link decisions as Bangumi external IDs."
    )
    parser.add_argument("archive_dir", help="directory containing subject.jsonlines")
    parser.add_argument("plan", help="JSON Lines plan created by the match planner")
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="write mappings; without this flag the command is read-only",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    settings = Settings.from_environment()
    if not settings.database_url:
        raise SystemExit("DATABASE_URL is required")

    auto_links = load_auto_links(Path(args.plan))
    report = ArchiveReport()
    batches = iter_archive_batches(
        Path(args.archive_dir) / "subject.jsonlines",
        report,
        {2},
        args.batch_size,
    )
    engine = build_engine(settings.database_url)
    try:
        context = engine.begin() if args.apply else engine.connect()
        with context as connection:
            applied = apply_auto_links(
                connection,
                batches,
                auto_links,
                dry_run=not args.apply,
            )
    finally:
        engine.dispose()
    LOGGER.info("Bangumi mappings complete: total=%s applied=%s", applied, args.apply)


if __name__ == "__main__":
    main()
