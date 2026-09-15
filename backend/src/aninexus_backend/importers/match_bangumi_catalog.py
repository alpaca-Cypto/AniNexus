from __future__ import annotations

import argparse
import json
import logging
from collections import Counter
from collections.abc import Iterable
from dataclasses import asdict
from pathlib import Path

from sqlalchemy.engine import Connection

from aninexus_backend.config import Settings
from aninexus_backend.db import build_engine
from aninexus_backend.importers.bangumi_archive import ArchiveReport, iter_archive_batches
from aninexus_backend.importers.catalog_matching import MatchDecision, plan_subject_matches

LOGGER = logging.getLogger("aninexus.import.match_bangumi_catalog")


def write_match_plan(
    connection: Connection,
    batches: Iterable[list[dict]],
    output: Path,
) -> Counter[str]:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f".{output.name}.tmp")
    counts: Counter[str] = Counter()
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as stream:
            for batch in batches:
                for decision in plan_subject_matches(connection, batch):
                    stream.write(_serialize_decision(decision) + "\n")
                    counts[decision.status] += 1
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    return counts


def _serialize_decision(decision: MatchDecision) -> str:
    return json.dumps(asdict(decision), ensure_ascii=False, separators=(",", ":"))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create a read-only MAL/Bangumi canonical match plan."
    )
    parser.add_argument("archive_dir", help="directory containing subject.jsonlines")
    parser.add_argument(
        "--output",
        default="backend/data/bangumi-match-plan.jsonl",
        help="destination JSON Lines match plan",
    )
    parser.add_argument("--kind", choices=("anime", "books", "all"), default="anime")
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--include-nsfw", action="store_true")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    settings = Settings.from_environment()
    if not settings.database_url:
        raise SystemExit("DATABASE_URL is required to match against the local catalog")

    archive_report = ArchiveReport()
    archive_batches = iter_archive_batches(
        Path(args.archive_dir) / "subject.jsonlines",
        archive_report,
        {"anime": {2}, "books": {1}, "all": {1, 2}}[args.kind],
        args.batch_size,
        args.limit,
        args.include_nsfw,
    )
    engine = build_engine(settings.database_url)
    try:
        with engine.connect() as connection:
            counts = write_match_plan(connection, archive_batches, Path(args.output))
    finally:
        engine.dispose()

    LOGGER.info(
        "Match plan complete: mapped=%s auto_link=%s review=%s new_subject=%s output=%s",
        counts["mapped"],
        counts["auto_link"],
        counts["review"],
        counts["new_subject"],
        args.output,
    )


if __name__ == "__main__":
    main()
