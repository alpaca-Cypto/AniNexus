from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

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
    catalog_source_mode: Literal["mixed", "bangumi"]
    bangumi_access_token: str | None = field(repr=False)
    bangumi_user_agent: str
    assistant_api_key: str | None = field(repr=False)
    assistant_provider: str
    assistant_model: str
    assistant_endpoint: str | None

    @classmethod
    def from_environment(cls) -> Settings:
        database_url = os.getenv("DATABASE_URL", "").strip()
        legacy_database_url = os.getenv("LEGACY_DATABASE_URL", "").strip() or None
        batch_size = int(os.getenv("IMPORT_BATCH_SIZE", "1000"))
        catalog_source_mode = os.getenv("CATALOG_SOURCE_MODE", "mixed").strip().lower()
        if catalog_source_mode not in {"mixed", "bangumi"}:
            raise ValueError("CATALOG_SOURCE_MODE must be 'mixed' or 'bangumi'")

        access_token = os.getenv("BANGUMI_ACCESS_TOKEN", "").strip() or None
        if access_token is None:
            configured_path = os.getenv("BANGUMI_API_KEY_FILE", "").strip()
            token_path = (
                Path(configured_path)
                if configured_path
                else BACKEND_ROOT.parent / "apikey" / "bangumi.txt"
            )
            try:
                access_token = token_path.read_text(encoding="utf-8-sig").strip() or None
            except OSError:
                access_token = None

        assistant_api_key = os.getenv("AI_ASSISTANT_API_KEY", "").strip() or None
        if assistant_api_key is None:
            configured_path = os.getenv("AI_ASSISTANT_API_KEY_FILE", "").strip()
            assistant_key_path = (
                Path(configured_path)
                if configured_path
                else BACKEND_ROOT.parent / "apikey" / "ai_assistant.txt"
            )
            try:
                assistant_api_key = (
                    assistant_key_path.read_text(encoding="utf-8-sig").strip() or None
                )
            except OSError:
                assistant_api_key = None

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
            catalog_source_mode=catalog_source_mode,
            bangumi_access_token=access_token,
            bangumi_user_agent=os.getenv(
                "BANGUMI_USER_AGENT",
                "AniNexus/0.1.0 (personal deployment)",
            ).strip(),
            assistant_api_key=assistant_api_key,
            assistant_provider=os.getenv("AI_ASSISTANT_PROVIDER", "deepseek").strip(),
            assistant_model=os.getenv("AI_ASSISTANT_MODEL", "deepseek-chat").strip(),
            assistant_endpoint=os.getenv("AI_ASSISTANT_ENDPOINT", "").strip() or None,
        )
