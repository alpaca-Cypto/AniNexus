from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from aninexus_backend.api.dependencies import current_user_id
from aninexus_backend.api.schemas import ReminderUpsert
from aninexus_backend.api.serializers import serialize_reminder
from aninexus_backend.db import get_session
from aninexus_backend.models import Subject, UpdateReminder

router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.get("")
def list_reminders(
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
    enabled: bool | None = None,
) -> dict:
    statement = select(UpdateReminder).where(UpdateReminder.user_id == user_id)
    if enabled is not None:
        statement = statement.where(UpdateReminder.enabled == enabled)
    reminders = session.scalars(statement.order_by(UpdateReminder.updated_at.desc())).unique()
    items = [serialize_reminder(item) for item in reminders]
    return {"items": items, "total": len(items)}


@router.put("/{subject_id}")
def upsert_reminder(
    subject_id: int,
    payload: ReminderUpsert,
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
) -> dict:
    subject = session.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="作品不存在")
    reminder = session.scalar(
        select(UpdateReminder).where(
            UpdateReminder.user_id == user_id,
            UpdateReminder.subject_id == subject_id,
        )
    )
    if reminder is None:
        reminder = UpdateReminder(user_id=user_id, subject_id=subject_id)
        session.add(reminder)
    reminder.enabled = payload.enabled
    reminder.channel = payload.channel
    reminder.subject = subject
    session.commit()
    session.refresh(reminder)
    return serialize_reminder(reminder)


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reminder(
    subject_id: int,
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
) -> None:
    reminder = session.scalar(
        select(UpdateReminder).where(
            UpdateReminder.user_id == user_id,
            UpdateReminder.subject_id == subject_id,
        )
    )
    if reminder is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="提醒不存在")
    session.delete(reminder)
    session.commit()
