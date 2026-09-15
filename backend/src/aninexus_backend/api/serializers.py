from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from aninexus_backend.models import Collection, Schedule, Subject, UpdateReminder


def serialize_subject(subject: Subject) -> dict[str, Any]:
    score = float(subject.score) if subject.score is not None else 0.0
    images = {"small": "", "grid": "", "large": "", "medium": "", "common": ""}
    if subject.image:
        images = dict.fromkeys(images, subject.image)
    return {
        "id": subject.id,
        "source": subject.source,
        "source_id": subject.source_id,
        "type": subject.subject_type,
        "name": subject.name,
        "name_cn": subject.name_cn or "",
        "summary": subject.summary,
        "short_summary": subject.summary or "",
        "date": subject.date.isoformat() if subject.date else None,
        "platform": subject.platform,
        "eps": subject.eps or 0,
        "volumes": subject.volumes or 0,
        "image": subject.image,
        "images": images,
        "score": score,
        "rating": {"score": score},
        "tags": [
            {"name": tag, "count": 0, "total_cont": 0} for tag in (subject.tags or [])
        ],
    }


def serialize_catalog_item(subject: Subject) -> dict[str, Any]:
    """Serialize the stable public-catalog interface consumed by discovery pages."""

    updated_at = subject.source_updated_at or subject.updated_at
    comparable_updated_at = (
        updated_at.replace(tzinfo=UTC) if updated_at.tzinfo is None else updated_at
    )
    return {
        "subject": serialize_subject(subject),
        "collection": None,
        "primary_source": subject.source,
        "score_source": subject.source if subject.score is not None else None,
        "data_updated_at": updated_at.isoformat(),
        "is_stale": comparable_updated_at < datetime.now(UTC) - timedelta(days=7),
    }


def serialize_collection(collection: Collection) -> dict[str, Any]:
    return {
        "id": str(collection.id),
        "user_id": collection.user_id,
        "source": collection.subject.source,
        "source_id": collection.subject.source_id,
        "type": collection.collection_type,
        "rate": collection.rate,
        "comment": collection.comment,
        "ep_status": collection.ep_status,
        "vol_status": collection.vol_status,
        "tags": collection.tags or [],
        "updated_at": collection.updated_at.isoformat(),
    }


def serialize_schedule(schedule: Schedule) -> dict[str, Any]:
    value = {
        "id": schedule.id,
        "user_id": schedule.user_id,
        "source": schedule.subject.source,
        "source_id": schedule.subject.source_id,
        "day_of_week": schedule.day_of_week,
        "start_time": schedule.start_time.strftime("%H:%M"),
        "watch_day": schedule.day_of_week,
        "watch_time": schedule.start_time.strftime("%H:%M"),
        "duration": schedule.duration,
        "watch_type": schedule.watch_type,
        "created_at": schedule.created_at.isoformat(),
        "updated_at": schedule.updated_at.isoformat(),
    }
    return {
        **value,
        "schedule": value,
        "subject": serialize_subject(schedule.subject),
    }


def serialize_reminder(reminder: UpdateReminder) -> dict[str, Any]:
    return {
        "id": reminder.id,
        "user_id": reminder.user_id,
        "subject_id": reminder.subject_id,
        "enabled": reminder.enabled,
        "channel": reminder.channel,
        "last_notified_at": (
            reminder.last_notified_at.isoformat() if reminder.last_notified_at else None
        ),
        "created_at": reminder.created_at.isoformat(),
        "updated_at": reminder.updated_at.isoformat(),
        "subject": serialize_subject(reminder.subject),
    }
