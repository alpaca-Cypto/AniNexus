from __future__ import annotations

import argparse
import json
import logging
import time
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from http.client import IncompleteRead
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from sqlalchemy import select, update
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from aninexus_backend.api.bangumi import API_BASE_URL, fetch_bangumi_calendar
from aninexus_backend.config import Settings
from aninexus_backend.db import build_engine
from aninexus_backend.importers.catalog_matching import plan_subject_matches
from aninexus_backend.importers.external_ids import link_subject_external_ids
from aninexus_backend.models import (
    CatalogRefreshItem,
    CatalogRefreshRun,
    Collection,
    Subject,
    SubjectExternalId,
)

LOGGER = logging.getLogger("aninexus.import.refresh_bangumi")


def _positive_id(value: object) -> str | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return str(number) if number > 0 else None


def candidate_ids(session: Session, calendar: list[dict], limit: int) -> list[str]:
    """Prioritize the public calendar, then active collections and recent entries."""
    ids: dict[str, None] = {}
    for day in calendar:
        if not isinstance(day, dict):
            continue
        for item in day.get("items", []):
            if isinstance(item, dict) and (item_id := _positive_id(item.get("id"))):
                ids[item_id] = None

    linked = session.scalars(
        select(SubjectExternalId.external_id)
        .join(Collection, Collection.subject_id == SubjectExternalId.subject_id)
        .where(
            SubjectExternalId.provider == "bangumi",
            Collection.collection_type.in_((1, 3)),
        )
        .distinct()
    )
    direct = session.scalars(
        select(Subject.source_id)
        .join(Collection, Collection.subject_id == Subject.id)
        .where(Subject.source == "bangumi", Collection.collection_type.in_((1, 3)))
        .distinct()
    )
    for value in (*linked, *direct):
        if item_id := _positive_id(value):
            ids[item_id] = None

    recent_cutoff = datetime.now(UTC).date() - timedelta(days=180)
    recent = session.scalars(
        select(Subject.source_id)
        .where(
            Subject.source == "bangumi",
            Subject.subject_type == 2,
            Subject.date >= recent_cutoff,
        )
        .order_by(Subject.updated_at.asc())
        .limit(limit)
    )
    for value in recent:
        if item_id := _positive_id(value):
            ids[item_id] = None
    return list(ids)[:limit]


def fetch_subject(subject_id: str, user_agent: str, *, sleep=time.sleep) -> dict:
    request = Request(
        f"{API_BASE_URL}/v0/subjects/{subject_id}",
        headers={"Accept": "application/json", "User-Agent": user_agent},
    )
    for attempt in range(3):
        try:
            with urlopen(request, timeout=20) as response:  # noqa: S310 - fixed host and numeric id
                payload = json.load(response)
            if not isinstance(payload, dict):
                raise ValueError(f"Bangumi subject {subject_id} returned an invalid object")
            return payload
        except HTTPError as error:
            if error.code == 404:
                raise ValueError(f"Bangumi subject {subject_id} was not found") from error
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
            retry_after = error.headers.get("Retry-After", "")
            sleep(min(30, int(retry_after)) if retry_after.isdigit() else 2 ** attempt)
        except (URLError, TimeoutError, IncompleteRead, ConnectionResetError, json.JSONDecodeError):
            if attempt == 2:
                raise
            sleep(2 ** attempt)
    raise RuntimeError("Bangumi retry loop ended unexpectedly")


def _subject_fields(remote: dict, fetched_at: datetime) -> dict | None:
    source_id = _positive_id(remote.get("id"))
    subject_type = remote.get("type")
    name = remote.get("name")
    if not source_id or subject_type not in (1, 2) or not isinstance(name, str) or not name.strip():
        return None
    if remote.get("nsfw") is True:
        return None
    date_value = remote.get("date")
    try:
        release_date = datetime.strptime(date_value, "%Y-%m-%d").date() if date_value else None
    except (TypeError, ValueError):
        release_date = None
    rating = remote.get("rating") if isinstance(remote.get("rating"), dict) else {}
    try:
        score = (
            Decimal(str(rating["score"])).quantize(Decimal("0.01"))
            if rating.get("score") else None
        )
    except (InvalidOperation, ValueError):
        score = None
    images = remote.get("images") if isinstance(remote.get("images"), dict) else {}
    image = next((images[key] for key in ("large", "common", "medium") if images.get(key)), None)
    if isinstance(image, str):
        image = image.replace("http://lain.bgm.tv/", "https://lain.bgm.tv/", 1)
    collection = remote.get("collection") if isinstance(remote.get("collection"), dict) else {}
    tags = remote.get("tags") if isinstance(remote.get("tags"), list) else []
    return {
        "source": "bangumi",
        "source_id": source_id,
        "subject_type": subject_type,
        "name": name.strip(),
        "name_cn": remote.get("name_cn") or None,
        "summary": remote.get("summary") or remote.get("short_summary") or None,
        "date": release_date,
        "platform": str(remote["platform"]) if remote.get("platform") is not None else None,
        "eps": remote.get("eps") or remote.get("total_episodes"),
        "volumes": remote.get("volumes"),
        "image": image,
        "score": score,
        "rank": remote.get("rank") or None,
        "popularity": collection.get("total"),
        "tags": [tag["name"] for tag in tags if isinstance(tag, dict) and tag.get("name")],
        "metadata_json": {"nsfw": False, "series": bool(remote.get("series", False))},
        "source_updated_at": fetched_at,
    }


def _record_item(
    session: Session,
    run_id: int | None,
    remote: dict,
    action: str,
    subject_id: int | None = None,
    error_kind: str | None = None,
) -> None:
    if run_id is None:
        return
    session.add(CatalogRefreshItem(
        run_id=run_id,
        subject_id=subject_id,
        bangumi_id=_positive_id(remote.get("id")) or "unknown",
        subject_type=remote.get("type") if remote.get("type") in (1, 2) else None,
        name=str(remote["name"])[:500] if remote.get("name") else None,
        action=action,
        error_kind=error_kind,
    ))


def apply_subject(
    session: Session, remote: dict, fetched_at: datetime, *, run_id: int | None = None
) -> str:
    fields = _subject_fields(remote, fetched_at)
    if fields is None:
        if run_id is not None:
            with session.begin():
                _record_item(session, run_id, remote, "skipped")
        return "skipped"
    with session.begin():
        subject = session.scalar(
            select(Subject).where(
                Subject.source == "bangumi",
                Subject.source_id == fields["source_id"],
                Subject.subject_type == fields["subject_type"],
            )
        )
        if subject is None:
            decision = plan_subject_matches(session.connection(), [fields])[0]
            if decision.status == "review":
                _record_item(session, run_id, remote, "review")
                return "review"
            subject = session.get(Subject, decision.subject_id) if decision.subject_id else None
        if subject is None:
            subject = Subject(**fields)
            session.add(subject)
            session.flush()
            result = "created"
        elif subject.source == "bangumi":
            changed = False
            for key, value in fields.items():
                if key not in {"source", "source_id", "subject_type"}:
                    if key == "metadata_json":
                        value = {**(subject.metadata_json or {}), **value}
                    if key != "source_updated_at" and getattr(subject, key) != value:
                        changed = True
                    setattr(subject, key, value)
            result = "updated" if changed else "unchanged"
        else:
            result = "unchanged" if decision.status == "mapped" else "linked"
        link_subject_external_ids(session.connection(), [(subject.id, fields)])
        _record_item(session, run_id, remote, result, subject.id)
    return result


def _start_run(engine: Engine) -> int:
    now = datetime.now(UTC).replace(tzinfo=None)
    with Session(engine) as session, session.begin():
        session.execute(
            update(CatalogRefreshRun)
            .where(CatalogRefreshRun.status == "running")
            .values(status="failed", finished_at=now, error_kind="Interrupted")
        )
        run = CatalogRefreshRun(
            started_at=now, status="running", scanned=0,
            created_count=0, updated_count=0, linked_count=0,
            unchanged_count=0, review_count=0, skipped_count=0, failed_count=0,
        )
        session.add(run)
        session.flush()
        return run.id


def _finish_run(
    engine: Engine, run_id: int, counts: dict[str, int], scanned: int,
    error_kind: str | None = None,
) -> None:
    with Session(engine) as session, session.begin():
        run = session.get(CatalogRefreshRun, run_id)
        if run is None:
            raise RuntimeError(f"Catalog refresh run {run_id} is missing")
        run.finished_at = datetime.now(UTC).replace(tzinfo=None)
        run.status = "failed" if error_kind else "partial" if counts["failed"] else "success"
        run.error_kind = error_kind
        run.scanned = scanned
        for action, value in counts.items():
            setattr(run, f"{action}_count", value)


def _fetch_calendar_with_retry(settings: Settings, *, sleep=time.sleep) -> list[dict]:
    for attempt in range(3):
        try:
            return fetch_bangumi_calendar(settings)
        except Exception:
            if attempt == 2:
                raise
            LOGGER.warning("Bangumi calendar request failed; retrying (%s/3)", attempt + 1)
            sleep(2 ** attempt)
    raise RuntimeError("Bangumi calendar retry loop ended unexpectedly")


def refresh_once(
    engine: Engine, settings: Settings, *, limit: int = 200, delay: float = 0.5
) -> dict[str, int]:
    run_id = _start_run(engine)
    counts = {
        key: 0 for key in
        ("created", "updated", "linked", "unchanged", "review", "skipped", "failed")
    }
    scanned = 0
    try:
        calendar = _fetch_calendar_with_retry(settings)
        with Session(engine) as session:
            subject_ids = candidate_ids(session, calendar, limit)
        LOGGER.info("Refreshing %s Bangumi subjects (run %s)", len(subject_ids), run_id)
        for index, subject_id in enumerate(subject_ids):
            if index and delay:
                time.sleep(delay)
            scanned += 1
            try:
                remote = fetch_subject(subject_id, settings.bangumi_user_agent)
                if _positive_id(remote.get("id")) != subject_id:
                    raise ValueError(f"Bangumi returned a mismatched subject ID for {subject_id}")
                with Session(engine) as session:
                    result = apply_subject(
                        session, remote, datetime.now(UTC).replace(tzinfo=None), run_id=run_id
                    )
                counts[result] += 1
            except Exception as error:
                counts["failed"] += 1
                LOGGER.exception("Failed to refresh Bangumi subject %s", subject_id)
                with Session(engine) as session, session.begin():
                    _record_item(
                        session, run_id, {"id": subject_id}, "failed",
                        error_kind=type(error).__name__,
                    )
            if (index + 1) % 25 == 0:
                LOGGER.info(
                    "Bangumi refresh progress: %s/%s %s", index + 1, len(subject_ids), counts
                )
    except Exception as error:
        _finish_run(engine, run_id, counts, scanned, type(error).__name__)
        raise
    _finish_run(engine, run_id, counts, scanned)
    LOGGER.info("Bangumi refresh complete: %s", counts)
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Refresh active Bangumi catalog entries")
    parser.add_argument("--loop", action="store_true", help="run immediately and then every day")
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--delay", type=float, default=0.5)
    args = parser.parse_args()
    if args.limit < 1 or args.delay < 0:
        parser.error("--limit must be positive and --delay must be nonnegative")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    settings = Settings.from_environment()
    if not settings.database_url:
        parser.error("DATABASE_URL is required")
    engine = build_engine(settings.database_url)
    try:
        while True:
            retry_after = 24 * 60 * 60
            try:
                counts = refresh_once(engine, settings, limit=args.limit, delay=args.delay)
                if counts["failed"] and not args.loop:
                    raise SystemExit(1)
            except Exception:
                if not args.loop:
                    raise
                LOGGER.exception("Bangumi daily refresh failed")
                retry_after = 15 * 60
            if not args.loop:
                break
            time.sleep(retry_after)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
