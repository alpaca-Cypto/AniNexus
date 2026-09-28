from __future__ import annotations

import argparse
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from aninexus_backend.auth import token_digest
from aninexus_backend.config import Settings
from aninexus_backend.db import build_engine
from aninexus_backend.models import InviteCode


def main() -> None:
    parser = argparse.ArgumentParser(description="Create one-use AniNexus registration invites")
    parser.add_argument("--count", type=int, default=1)
    parser.add_argument("--days", type=int, default=14)
    args = parser.parse_args()
    if not 1 <= args.count <= 50 or not 1 <= args.days <= 365:
        parser.error("count must be 1–50 and days must be 1–365")

    engine = build_engine(Settings.from_environment().database_url)
    codes = [secrets.token_urlsafe(24) for _ in range(args.count)]
    expires_at = datetime.now(UTC).replace(tzinfo=None) + timedelta(days=args.days)
    try:
        with Session(engine) as session:
            session.add_all(
                InviteCode(code_hash=token_digest(code), expires_at=expires_at)
                for code in codes
            )
            session.commit()
    finally:
        engine.dispose()

    for code in codes:
        print(code)


if __name__ == "__main__":
    main()
