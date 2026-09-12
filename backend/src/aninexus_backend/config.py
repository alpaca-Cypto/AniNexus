from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_ROOT / ".env")


@dataclass(frozen=True, slots=True)
class Settings:
    database_url: str
    legacy_database_url: str | None
    import_batch_size: int
    public_catalog_path: str
    default_user_id: int
    auto_create_tables: bool

    @classmethod
    def from_environment(cls) -> Settings:
        database_url = os.getenv("DATABASE_URL", "").strip()
        legacy_database_url = os.getenv("LEGACY_DATABASE_URL", "").strip() or None
        batch_size = int(os.getenv("IMPORT_BATCH_SIZE", "1000"))

        if batch_size < 1:
            raise ValueError("IMPORT_BATCH_SIZE must be greater than zero")

        return cls(
            database_url=database_url,
            legacy_database_url=legacy_database_url,
            import_batch_size=batch_size,
            public_catalog_path=os.getenv(
                "PUBLIC_CATALOG_PATH",
                "backend/data/aninexus-public-catalog.jsonl.gz",
            ).strip(),
            default_user_id=int(os.getenv("DEFAULT_USER_ID", "1")),
            auto_create_tables=os.getenv("AUTO_CREATE_TABLES", "true").lower()
            in {"1", "true", "yes", "on"},
        )
