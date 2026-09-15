import re
from collections import Counter
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import String, case, cast, func, literal, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from aninexus_backend.api.serializers import serialize_catalog_item, serialize_subject
from aninexus_backend.db import get_session
from aninexus_backend.models import Subject

router = APIRouter(prefix="/subjects", tags=["subjects"])

_SYNOPSIS_STOP_WORDS = {
    "about", "after", "again", "also", "and", "are", "back", "been", "before",
    "between", "both", "but", "can", "could", "day", "did", "does", "each",
    "even", "every", "few", "first", "for", "from", "had", "has", "have", "her",
    "here", "his", "how", "into", "its", "just", "life", "man", "may", "might",
    "more", "most", "much", "new", "not", "now", "once", "one", "only", "other",
    "our", "out", "over", "own", "same", "shall", "she", "should", "some", "still",
    "story", "such", "than", "that", "the", "their", "them", "then", "there", "these",
    "they", "this", "those", "through", "time", "too", "very", "was", "way", "well",
    "were", "what", "when", "where", "which", "who", "will", "with", "without", "world",
    "would", "year", "you", "your",
}


def _extract_synopsis_keywords(summary: str | None, limit: int = 8) -> list[str]:
    if not summary:
        return []
    words = (word.casefold() for word in re.findall(r"[a-zA-Z]{4,}", summary))
    counts = Counter(word for word in words if word not in _SYNOPSIS_STOP_WORDS)
    return [word for word, _count in counts.most_common(limit)]


def _metadata_values(subject: Subject, key: str) -> list[str]:
    value = (subject.metadata_json or {}).get(key, [])
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _json_value_match(column: ColumnElement, value: str) -> ColumnElement[bool]:
    return cast(column, String).like(f'%"{_escape_like(value)}"%', escape="\\")


def _similarity_criteria(
    subject: Subject,
    dimensions: set[str] | None = None,
) -> list[tuple[ColumnElement[bool], int, str]]:
    enabled = dimensions or {"tag", "story", "creator", "staff", "studio"}
    criteria: list[tuple[ColumnElement[bool], int, str]] = []
    if "tag" in enabled:
        for tag in (subject.tags or [])[:3]:
            criteria.append((_json_value_match(Subject.tags, tag), 2, f"共同标签：{tag}"))

    metadata_weights = {
        "authors": (4, "同作者", "creator"),
        "studios": (3, "同制作公司", "studio"),
        "producers": (2, "同制作方", "staff"),
        "themes": (2, "共同主题", "tag"),
        "demographics": (1, "受众相近", "tag"),
        "voice_actors": (3, "同声优", "voice_actor"),
    }
    for key, (weight, label, dimension) in metadata_weights.items():
        if dimension not in enabled:
            continue
        for value in _metadata_values(subject, key)[:4]:
            criteria.append(
                (_json_value_match(Subject.metadata_json, value), weight, f"{label}：{value}")
            )

    if "story" in enabled:
        for keyword in _extract_synopsis_keywords(subject.summary):
            criteria.append(
                (
                    func.lower(func.coalesce(Subject.summary, "")).like(
                        f"%{_escape_like(keyword)}%", escape="\\"
                    ),
                    1,
                    "故事内容相近",
                )
            )
    return criteria


def _similar_subjects(
    session: Session,
    subject: Subject,
    limit: int,
    dimensions: set[str] | None = None,
) -> list[dict]:
    criteria = _similarity_criteria(subject, dimensions)
    if not criteria:
        return []

    relevance = sum(
        (case((condition, weight), else_=0) for condition, weight, _reason in criteria),
        start=literal(0),
    ).label("relevance")
    filters = [
        Subject.id != subject.id,
        Subject.subject_type == subject.subject_type,
        or_(*(condition for condition, _weight, _reason in criteria)),
    ]
    if subject.platform:
        filters.append(Subject.platform == subject.platform)

    statement = (
        select(Subject, relevance)
        .where(*filters)
        .order_by(
            relevance.desc(),
            Subject.score.desc(),
            Subject.popularity.asc(),
            Subject.id.asc(),
        )
        .limit(limit)
    )
    recommendations = []
    for candidate, score in session.execute(statement):
        reasons = []
        story_reason_added = False
        for _condition, _weight, reason in criteria:
            if reason == "故事内容相近":
                if story_reason_added:
                    continue
                candidate_summary = (candidate.summary or "").casefold()
                if any(
                    keyword in candidate_summary
                    for keyword in _extract_synopsis_keywords(subject.summary)
                ):
                    reasons.append(reason)
                    story_reason_added = True
                continue

            value = reason.partition("：")[2]
            if reason.startswith("共同标签"):
                matched = value.casefold() in {tag.casefold() for tag in (candidate.tags or [])}
            else:
                metadata_key = {
                    "同作者": "authors",
                    "同制作公司": "studios",
                    "同制作方": "producers",
                    "共同主题": "themes",
                    "受众相近": "demographics",
                    "同声优": "voice_actors",
                }.get(reason.partition("：")[0])
                matched = bool(
                    metadata_key
                    and value.casefold()
                    in {item.casefold() for item in _metadata_values(candidate, metadata_key)}
                )
            if matched and reason not in reasons:
                reasons.append(reason)

        recommendations.append(
            {
                "subject": serialize_subject(candidate),
                "relevance": int(score),
                "reasons": reasons[:3],
            }
        )
    return recommendations


@router.get("")
def list_subjects(
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    q: Annotated[str | None, Query(max_length=200)] = None,
    type: Annotated[int | None, Query(ge=1)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    year_from: Annotated[int | None, Query(ge=1900, le=2200)] = None,
    score_from: Annotated[float | None, Query(ge=0, le=10)] = None,
    include_nsfw: bool = False,
    sort: Literal["score", "date", "title"] = "score",
) -> dict:
    filters = []
    if request.app.state.catalog_source_mode == "bangumi":
        filters.append(Subject.source == "bangumi")
    if not include_nsfw:
        nsfw_value = Subject.metadata_json["nsfw"].as_boolean()
        filters.append(
            or_(
                Subject.metadata_json.is_(None),
                nsfw_value.is_(None),
                nsfw_value.is_(False),
            )
        )
    if type is not None:
        filters.append(Subject.subject_type == type)
    if q and q.strip():
        pattern = f"%{_escape_like(q.strip())}%"
        filters.append(
            or_(
                Subject.name.like(pattern, escape="\\"),
                Subject.name_cn.like(pattern, escape="\\"),
                Subject.title_english.like(pattern, escape="\\"),
                Subject.title_japanese.like(pattern, escape="\\"),
            )
        )
    if year_from is not None:
        filters.append(Subject.date >= date(year_from, 1, 1))
    if score_from is not None:
        filters.append(Subject.score >= score_from)

    total = session.scalar(select(func.count()).select_from(Subject).where(*filters)) or 0
    ordering = {
        "score": (Subject.score.desc(), Subject.popularity.asc()),
        "date": (Subject.date.desc(), Subject.score.desc()),
        "title": (func.coalesce(Subject.name_cn, Subject.name).asc(), Subject.id.asc()),
    }[sort]
    statement = (
        select(Subject)
        .where(*filters)
        .order_by(*ordering, Subject.id.asc())
        .offset(offset)
        .limit(limit)
    )
    return {
        "total": total,
        "items": [
            serialize_catalog_item(item) for item in session.scalars(statement)
        ],
    }


@router.get("/{subject_id}")
def get_subject(
    subject_id: int,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    subject = session.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="作品不存在")
    return {"subject": serialize_subject(subject), "collection": None}


@router.get("/{subject_id}/similar")
def get_similar_subjects(
    subject_id: int,
    session: Annotated[Session, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=20)] = 10,
) -> dict:
    subject = session.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="作品不存在")
    return {"items": _similar_subjects(session, subject, limit)}
