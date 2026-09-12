from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from aninexus_backend.api.serializers import serialize_subject
from aninexus_backend.db import get_session
from aninexus_backend.models import Subject

router = APIRouter(prefix="/subjects", tags=["subjects"])


@router.get("")
def list_subjects(
    session: Annotated[Session, Depends(get_session)],
    q: Annotated[str | None, Query(max_length=200)] = None,
    type: Annotated[int | None, Query(ge=1)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    year_from: Annotated[int | None, Query(ge=1900, le=2200)] = None,
    score_from: Annotated[float | None, Query(ge=0, le=10)] = None,
    sort: Literal["score", "date", "title"] = "score",
) -> dict:
    filters = []
    if type is not None:
        filters.append(Subject.subject_type == type)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        filters.append(
            or_(
                Subject.name.like(pattern),
                Subject.name_cn.like(pattern),
                Subject.title_english.like(pattern),
                Subject.title_japanese.like(pattern),
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
            {"subject": serialize_subject(item), "collection": None}
            for item in session.scalars(statement)
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
