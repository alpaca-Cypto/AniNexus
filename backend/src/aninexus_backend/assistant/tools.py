from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from datetime import date
from typing import Any

from pydantic import ValidationError
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from aninexus_backend.api.serializers import serialize_collection, serialize_subject
from aninexus_backend.api.subjects import _similar_subjects
from aninexus_backend.assistant.schemas import (
    CollectionListInput,
    CollectionOverviewInput,
    LibraryRecommendationInput,
    SimilarSubjectsInput,
    SubjectDetailInput,
    SubjectSearchInput,
    TasteProfileInput,
    ToolInput,
)
from aninexus_backend.models import Collection, Subject

ToolHandler = Callable[[ToolInput, Session, int], dict[str, Any]]

STATUS_NAMES = {1: "wish", 2: "collect", 3: "doing", 4: "on_hold", 5: "dropped"}
DEFAULT_SIMILARITY_DIMENSIONS = ["tag", "story", "creator", "staff", "studio"]
DEFAULT_PROFILE_DIMENSIONS = ["tag", "creator", "staff", "studio", "year"]
UNAVAILABLE_DIMENSIONS = {"voice_actor": "声优关系数据尚未补全"}


def _title(subject: Subject) -> str:
    return subject.name_cn or subject.name


def _metadata(subject: Subject, key: str) -> list[str]:
    value = (subject.metadata_json or {}).get(key, [])
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _subject_card(subject: Subject) -> dict[str, Any]:
    return {
        "subject_id": subject.id,
        "title": _title(subject),
        "name": subject.name,
        "cover": subject.image,
        "subject_type": subject.subject_type,
        "score": float(subject.score or 0),
        "date": subject.date.isoformat() if subject.date else None,
        "tags": subject.tags or [],
        "source": subject.source,
        "source_id": subject.source_id,
    }


def _collection_weight(collection: Collection) -> float:
    status_weight = {1: 0.5, 2: 1.0, 3: 1.2, 4: -0.4, 5: -1.5}.get(
        collection.collection_type, 0.0
    )
    if collection.rate is None:
        return status_weight
    if collection.rate >= 9:
        return status_weight + 3.0
    if collection.rate >= 7:
        return status_weight + 2.0
    if collection.rate <= 4:
        return status_weight - 2.0
    return status_weight + 0.5


def _get_collection_overview(
    payload: CollectionOverviewInput, session: Session, user_id: int
) -> dict[str, Any]:
    filters = [Collection.user_id == user_id]
    if payload.subject_type is not None:
        filters.append(Subject.subject_type == payload.subject_type)
    rows = session.execute(
        select(Collection.collection_type, func.count(Collection.id))
        .join(Collection.subject)
        .where(*filters)
        .group_by(Collection.collection_type)
    ).all()
    by_status = {name: 0 for name in STATUS_NAMES.values()}
    for status_id, count in rows:
        if status_id in STATUS_NAMES:
            by_status[STATUS_NAMES[status_id]] = int(count)
    total = sum(by_status.values())
    rated_count, average_rate, last_updated = session.execute(
        select(
            func.count(Collection.rate),
            func.avg(Collection.rate),
            func.max(Collection.updated_at),
        )
        .join(Collection.subject)
        .where(*filters)
    ).one()
    return {
        "synced": total > 0,
        "total": total,
        "by_status": by_status,
        "rated_count": int(rated_count or 0),
        "average_user_rate": round(float(average_rate), 2) if average_rate is not None else None,
        "last_synced_at": last_updated.isoformat() if last_updated else None,
    }


def _list_collections(
    payload: CollectionListInput, session: Session, user_id: int
) -> dict[str, Any]:
    filters = [Collection.user_id == user_id]
    if payload.subject_type is not None:
        filters.append(Subject.subject_type == payload.subject_type)
    if payload.collection_status is not None:
        filters.append(Collection.collection_type == payload.collection_status)
    if payload.min_user_rate is not None:
        filters.append(Collection.rate >= payload.min_user_rate)
    if payload.keyword and payload.keyword.strip():
        pattern = f"%{payload.keyword.strip()}%"
        filters.append(
            or_(
                Subject.name.like(pattern),
                Subject.name_cn.like(pattern),
                Subject.title_english.like(pattern),
                Subject.title_japanese.like(pattern),
            )
        )
    ordering = {
        "updated": (Collection.updated_at.desc(),),
        "user_rate": (Collection.rate.desc(), Collection.updated_at.desc()),
        "subject_score": (Subject.score.desc(), Collection.updated_at.desc()),
    }[payload.sort]
    total = session.scalar(
        select(func.count()).select_from(Collection).join(Collection.subject).where(*filters)
    ) or 0
    records = session.scalars(
        select(Collection)
        .join(Collection.subject)
        .where(*filters)
        .order_by(*ordering)
        .limit(payload.limit)
    ).unique()
    items = []
    for record in records:
        item = _subject_card(record.subject)
        item.update(
            {
                "collection_status": STATUS_NAMES.get(record.collection_type, "unknown"),
                "collection_status_id": record.collection_type,
                "user_rate": record.rate,
                "progress": {"episodes": record.ep_status, "volumes": record.vol_status},
                "updated_at": record.updated_at.isoformat(),
            }
        )
        items.append(item)
    return {"total": int(total), "items": items}


def _search_subjects(
    payload: SubjectSearchInput, session: Session, _user_id: int
) -> dict[str, Any]:
    pattern = f"%{payload.query.strip()}%"
    filters = [
        or_(
            Subject.name.like(pattern),
            Subject.name_cn.like(pattern),
            Subject.title_english.like(pattern),
            Subject.title_japanese.like(pattern),
        )
    ]
    if payload.subject_type is not None:
        filters.append(Subject.subject_type == payload.subject_type)
    if payload.year_from is not None:
        filters.append(Subject.date >= date(payload.year_from, 1, 1))
    if payload.score_from is not None:
        filters.append(Subject.score >= payload.score_from)
    total = session.scalar(select(func.count()).select_from(Subject).where(*filters)) or 0
    subjects = session.scalars(
        select(Subject)
        .where(*filters)
        .order_by(Subject.score.desc(), Subject.popularity.asc(), Subject.id.asc())
        .limit(payload.limit)
    )
    return {"total": int(total), "items": [_subject_card(subject) for subject in subjects]}


def _get_subject_detail(
    payload: SubjectDetailInput, session: Session, user_id: int
) -> dict[str, Any]:
    subject = session.get(Subject, payload.subject_id)
    if subject is None:
        return {"found": False, "subject_id": payload.subject_id, "message": "作品不存在"}
    collection = session.scalar(
        select(Collection).where(
            Collection.user_id == user_id,
            Collection.subject_id == subject.id,
        )
    )
    result: dict[str, Any] = {
        "found": True,
        "subject": serialize_subject(subject),
        "collection": serialize_collection(collection) if collection else None,
    }
    if payload.include_credits:
        metadata = subject.metadata_json or {}
        result["credits"] = {
            "creators": _metadata(subject, "authors"),
            "staff": _metadata(subject, "producers"),
            "studios": _metadata(subject, "studios"),
            "voice_actors": metadata.get("voice_actors", []),
            "data_complete": bool(metadata.get("voice_actors")),
        }
    return result


def _find_similar_subjects(
    payload: SimilarSubjectsInput, session: Session, user_id: int
) -> dict[str, Any]:
    subject = session.get(Subject, payload.subject_id)
    if subject is None:
        return {"found": False, "subject_id": payload.subject_id, "items": []}
    dimensions = payload.dimensions or DEFAULT_SIMILARITY_DIMENSIONS
    collected_ids: set[int] = set()
    if payload.exclude_collected:
        collected_ids = set(
            session.scalars(select(Collection.subject_id).where(Collection.user_id == user_id))
        )
    fetch_limit = min(100, payload.limit + len(collected_ids))
    matches = _similar_subjects(
        session,
        subject,
        fetch_limit,
        dimensions=set(dimensions),
    )
    items = []
    for match in matches:
        candidate_id = int(match["subject"]["id"])
        if payload.exclude_collected and candidate_id in collected_ids:
            continue
        items.append(
            {
                "subject": match["subject"],
                "relevance": match["relevance"],
                "reasons": match["reasons"],
                "already_collected": candidate_id in collected_ids,
            }
        )
        if len(items) >= payload.limit:
            break
    unavailable = [
        UNAVAILABLE_DIMENSIONS[item]
        for item in dimensions
        if item in UNAVAILABLE_DIMENSIONS
    ]
    return {
        "found": True,
        "seed": _subject_card(subject),
        "items": items,
        "data_notes": unavailable,
    }


def _get_taste_profile(
    payload: TasteProfileInput, session: Session, user_id: int
) -> dict[str, Any]:
    dimensions = payload.dimensions or DEFAULT_PROFILE_DIMENSIONS
    filters = [Collection.user_id == user_id]
    if payload.subject_type is not None:
        filters.append(Subject.subject_type == payload.subject_type)
    collections = list(
        session.scalars(
            select(Collection).join(Collection.subject).where(*filters)
        ).unique()
    )
    buckets: dict[str, dict[str, list[float]]] = {
        dimension: defaultdict(list) for dimension in dimensions
    }
    metadata_keys = {"creator": "authors", "staff": "producers", "studio": "studios"}
    for collection in collections:
        weight = _collection_weight(collection)
        subject = collection.subject
        if "tag" in buckets:
            for value in subject.tags or []:
                buckets["tag"][value].append(weight)
        for dimension, metadata_key in metadata_keys.items():
            if dimension in buckets:
                for value in _metadata(subject, metadata_key):
                    buckets[dimension][value].append(weight)
        if "year" in buckets and subject.date:
            buckets["year"][str(subject.date.year)].append(weight)
        if "voice_actor" in buckets:
            for value in _metadata(subject, "voice_actors"):
                buckets["voice_actor"][value].append(weight)

    result: dict[str, Any] = {}
    for dimension, values in buckets.items():
        ranked = sorted(
            (
                {
                    "name": name,
                    "weight": round(sum(weights), 3),
                    "evidence_count": len(weights),
                }
                for name, weights in values.items()
                if sum(weights) > 0
            ),
            key=lambda item: (-item["weight"], -item["evidence_count"], item["name"]),
        )
        result[dimension] = ranked[: payload.top_n]
    notes = [UNAVAILABLE_DIMENSIONS[item] for item in dimensions if item in UNAVAILABLE_DIMENSIONS]
    return {
        "has_collection": bool(collections),
        "collection_count": len(collections),
        "dimensions": result,
        "data_notes": notes,
    }


def _recommend_from_library(
    payload: LibraryRecommendationInput, session: Session, user_id: int
) -> dict[str, Any]:
    dimensions = payload.dimensions or DEFAULT_SIMILARITY_DIMENSIONS
    collected_ids = set(
        session.scalars(select(Collection.subject_id).where(Collection.user_id == user_id))
    )
    if payload.seed_subject_ids:
        seed_records = list(
            session.scalars(
                select(Subject).where(
                    Subject.id.in_(payload.seed_subject_ids),
                    Subject.subject_type == payload.subject_type,
                )
            )
        )
        seed_weights = {subject.id: 2.0 for subject in seed_records}
    else:
        seed_collections = list(
            session.scalars(
                select(Collection)
                .join(Collection.subject)
                .where(
                    Collection.user_id == user_id,
                    Subject.subject_type == payload.subject_type,
                    Collection.collection_type.in_([1, 2, 3]),
                )
                .order_by(
                    case((Collection.rate.is_(None), 1), else_=0),
                    Collection.rate.desc(),
                    Collection.updated_at.desc(),
                )
                .limit(10)
            ).unique()
        )
        seed_records = [record.subject for record in seed_collections]
        seed_weights = {
            record.subject_id: max(0.5, _collection_weight(record))
            for record in seed_collections
        }

    candidate_scores: dict[int, float] = defaultdict(float)
    candidate_reasons: dict[int, list[str]] = defaultdict(list)
    candidates: dict[int, Subject] = {}
    for seed in seed_records:
        matches = _similar_subjects(
            session,
            seed,
            30,
            dimensions=set(dimensions),
        )
        for match in matches:
            candidate_id = int(match["subject"]["id"])
            if payload.exclude_collected and candidate_id in collected_ids:
                continue
            candidate = session.get(Subject, candidate_id)
            if candidate is None or float(candidate.score or 0) < payload.min_subject_score:
                continue
            candidates[candidate_id] = candidate
            candidate_scores[candidate_id] += float(match["relevance"]) * seed_weights[seed.id]
            for reason in match["reasons"]:
                explanation = f"与《{_title(seed)}》{reason}"
                if explanation not in candidate_reasons[candidate_id]:
                    candidate_reasons[candidate_id].append(explanation)

    ranked_ids = sorted(
        candidate_scores,
        key=lambda item: (
            -candidate_scores[item],
            -float(candidates[item].score or 0),
            candidates[item].id,
        ),
    )[: payload.limit]
    max_score = candidate_scores[ranked_ids[0]] if ranked_ids else 1.0
    items = []
    for candidate_id in ranked_ids:
        candidate = candidates[candidate_id]
        item = _subject_card(candidate)
        item.update(
            {
                "match_score": round(candidate_scores[candidate_id] / max_score, 3),
                "reasons": candidate_reasons[candidate_id][:4],
                "already_collected": candidate_id in collected_ids,
            }
        )
        items.append(item)
    notes = [UNAVAILABLE_DIMENSIONS[item] for item in dimensions if item in UNAVAILABLE_DIMENSIONS]
    return {
        "has_collection": bool(collected_ids),
        "seed_subjects": [_subject_card(subject) for subject in seed_records],
        "items": items,
        "data_notes": notes,
    }


TOOL_SPECS: list[tuple[str, str, type[ToolInput], ToolHandler]] = [
    (
        "get_my_collection_overview",
        "读取当前登录用户的收藏数量、状态分布和评分概览。",
        CollectionOverviewInput,
        _get_collection_overview,
    ),
    (
        "list_my_collections",
        "按状态、类型、关键词或用户评分读取当前用户的具体收藏。",
        CollectionListInput,
        _list_collections,
    ),
    (
        "search_subjects",
        "在 AniNexus 本地公共作品库中搜索条目，并返回稳定的 subject_id。",
        SubjectSearchInput,
        _search_subjects,
    ),
    (
        "get_subject_detail",
        "读取一个作品的详情以及当前用户对它的收藏状态。",
        SubjectDetailInput,
        _get_subject_detail,
    ),
    (
        "find_similar_subjects",
        "围绕指定作品查找题材、内容、作者或制作公司相似的作品。",
        SimilarSubjectsInput,
        _find_similar_subjects,
    ),
    (
        "get_my_taste_profile",
        "根据当前用户的收藏状态和评分生成可解释的兴趣画像。",
        TasteProfileInput,
        _get_taste_profile,
    ),
    (
        "recommend_from_my_library",
        "综合当前用户的高分收藏和偏好，推荐尚未收藏的作品并返回理由。",
        LibraryRecommendationInput,
        _recommend_from_library,
    ),
]

TOOL_MODELS = {name: model for name, _description, model, _handler in TOOL_SPECS}
TOOL_HANDLERS = {name: handler for name, _description, _model, handler in TOOL_SPECS}
TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": model.model_json_schema(),
        },
    }
    for name, description, model, _handler in TOOL_SPECS
]


def execute_tool(
    name: str,
    arguments: dict[str, Any],
    session: Session,
    user_id: int,
) -> dict[str, Any]:
    model = TOOL_MODELS.get(name)
    handler = TOOL_HANDLERS.get(name)
    if model is None or handler is None:
        return {"error": "unknown_tool", "message": f"未知工具：{name}"}
    try:
        payload = model.model_validate(arguments)
    except ValidationError as exc:
        return {
            "error": "invalid_arguments",
            "message": "工具参数无效",
            "details": exc.errors(include_url=False),
        }
    return handler(payload, session, user_id)
