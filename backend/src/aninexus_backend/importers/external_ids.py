from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import insert, select, tuple_
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.engine import Connection

from aninexus_backend.models import Subject, SubjectExternalId


def _record_hash(record: Mapping[str, Any]) -> str:
    encoded = json.dumps(
        record,
        default=str,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def register_subject_external_ids(
    connection: Connection,
    records: Sequence[Mapping[str, Any]],
) -> int:
    """Register direct provider identities after their subjects have been upserted."""

    identities = {
        (str(record["source"]), str(record["source_id"]), int(record["subject_type"]))
        for record in records
    }
    if not identities:
        return 0

    subjects = connection.execute(
        select(Subject.id, Subject.source, Subject.source_id, Subject.subject_type).where(
            tuple_(Subject.source, Subject.source_id, Subject.subject_type).in_(identities)
        )
    ).all()
    record_by_identity = {
        (str(record["source"]), str(record["source_id"]), int(record["subject_type"])): record
        for record in records
    }
    links = []
    for subject_id, provider, external_id, subject_type in subjects:
        record = record_by_identity[(provider, external_id, subject_type)]
        links.append((subject_id, record))
    return link_subject_external_ids(connection, links)


def link_subject_external_ids(
    connection: Connection,
    links: Sequence[tuple[int, Mapping[str, Any]]],
) -> int:
    """Map provider records to canonical subjects without changing subject rows."""

    fetched_at = datetime.now(UTC).replace(tzinfo=None)
    values = [
        {
            "subject_id": subject_id,
            "provider": str(record["source"]),
            "external_id": str(record["source_id"]),
            "subject_type": int(record["subject_type"]),
            "provider_updated_at": record.get("source_updated_at"),
            "last_fetched_at": fetched_at,
            "raw_hash": _record_hash(record),
        }
        for subject_id, record in links
    ]
    if not values:
        return 0

    dialect = connection.dialect.name
    if dialect == "mysql":
        statement = mysql_insert(SubjectExternalId).values(values)
        connection.execute(
            statement.on_duplicate_key_update(
                subject_id=statement.inserted.subject_id,
                provider_updated_at=statement.inserted.provider_updated_at,
                last_fetched_at=statement.inserted.last_fetched_at,
                raw_hash=statement.inserted.raw_hash,
            )
        )
    elif dialect == "sqlite":
        statement = sqlite_insert(SubjectExternalId).values(values)
        connection.execute(
            statement.on_conflict_do_update(
                index_elements=["provider", "external_id", "subject_type"],
                set_={
                    "subject_id": statement.excluded.subject_id,
                    "provider_updated_at": statement.excluded.provider_updated_at,
                    "last_fetched_at": statement.excluded.last_fetched_at,
                    "raw_hash": statement.excluded.raw_hash,
                },
            )
        )
    else:
        connection.execute(insert(SubjectExternalId), values)
    return len(values)
