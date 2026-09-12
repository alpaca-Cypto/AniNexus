from __future__ import annotations

import argparse
import logging
from pathlib import Path

from aninexus_backend.config import Settings
from aninexus_backend.db import build_engine
from aninexus_backend.importers.public_catalog import write_public_bundle
from aninexus_backend.importers.search_manga import CatalogKind, iter_transformed_catalog

LOGGER = logging.getLogger("aninexus.export.public_catalog")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Export a shareable catalog bundle without users or private application data."
    )
    parser.add_argument(
        "--output",
        default="backend/data/aninexus-public-catalog.jsonl.gz",
        help="destination .jsonl.gz file",
    )
    parser.add_argument("--batch-size", type=int, help="rows read per batch")
    parser.add_argument("--limit", type=int, help="maximum rows per table for development")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    settings = Settings.from_environment()
    if not settings.legacy_database_url:
        raise SystemExit("LEGACY_DATABASE_URL is required to publish a catalog bundle")
    batch_size = args.batch_size or settings.import_batch_size
    if batch_size < 1:
        raise SystemExit("--batch-size must be greater than zero")
    if args.limit is not None and args.limit < 1:
        raise SystemExit("--limit must be greater than zero")

    legacy_engine = build_engine(settings.legacy_database_url)
    kinds: tuple[CatalogKind, ...] = ("anime", "manga")
    try:
        transformed_batches = (
            batch
            for _, batch in iter_transformed_catalog(
                legacy_engine,
                kinds,
                batch_size,
                args.limit,
            )
        )
        output = Path(args.output)
        count, checksum = write_public_bundle(output, transformed_batches)
        LOGGER.info("Export complete: records=%s file=%s", count, output)
        LOGGER.info("SHA-256: %s", checksum)
    finally:
        legacy_engine.dispose()


if __name__ == "__main__":
    main()
