from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from aninexus_backend.api.dependencies import current_user_id
from aninexus_backend.api.schemas import ScheduleUpsert, ScheduleUpsertList
from aninexus_backend.api.serializers import serialize_collection, serialize_schedule
from aninexus_backend.db import get_session
from aninexus_backend.models import Collection, Schedule, Subject

router = APIRouter(prefix="/schedules", tags=["schedules"])


def _resolve_subject(session: Session, item: ScheduleUpsert) -> Subject:
    statement = select(Subject).where(
        Subject.source == item.source,
        Subject.source_id == item.source_id,
    )
    if item.subject_type is not None:
        statement = statement.where(Subject.subject_type == item.subject_type)
    subjects = list(session.scalars(statement.limit(2)))
    if not subjects:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"找不到作品 {item.source}:{item.source_id}",
        )
    if len(subjects) > 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="作品来源 ID 不唯一，请同时提供 subject_type",
        )
    return subjects[0]


@router.get("")
def list_schedules(
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
) -> dict:
    schedules = session.scalars(
        select(Schedule)
        .where(Schedule.user_id == user_id)
        .order_by(Schedule.day_of_week, Schedule.start_time, Schedule.id)
    ).unique()
    items = []
    for schedule in schedules:
        collection = session.scalar(
            select(Collection).where(
                Collection.user_id == user_id,
                Collection.subject_id == schedule.subject_id,
            )
        )
        serialized = serialize_schedule(schedule)
        serialized["collection"] = None
        if collection is not None:
            serialized["collection"] = serialize_collection(collection)
        items.append(serialized)
    return {"items": items, "total": len(items)}


@router.post("/bulk-upsert")
def bulk_upsert_schedules(
    payload: ScheduleUpsertList,
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
) -> dict:
    touched: list[Schedule] = []
    for item in payload.items:
        subject = _resolve_subject(session, item)
        schedule = session.scalar(
            select(Schedule).where(
                Schedule.user_id == user_id,
                Schedule.subject_id == subject.id,
            )
        )
        if schedule is None:
            schedule = Schedule(user_id=user_id, subject_id=subject.id)
            session.add(schedule)
        schedule.day_of_week = item.day_of_week
        schedule.start_time = item.start_time
        schedule.duration = item.duration
        schedule.watch_type = item.watch_type
        schedule.subject = subject
        touched.append(schedule)

    session.commit()
    for schedule in touched:
        session.refresh(schedule)
    return {"items": [serialize_schedule(item) for item in touched], "total": len(touched)}


@router.delete("/all")
def delete_all_schedules(
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
) -> dict[str, str]:
    schedules = session.scalars(select(Schedule).where(Schedule.user_id == user_id))
    for schedule in schedules:
        session.delete(schedule)
    session.commit()
    return {"status": "success", "message": "时间表已清空"}
