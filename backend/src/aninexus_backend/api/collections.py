from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from aninexus_backend.api.dependencies import current_user_id
from aninexus_backend.api.schemas import CollectionUpsert
from aninexus_backend.api.serializers import serialize_collection, serialize_subject
from aninexus_backend.db import get_session
from aninexus_backend.models import Collection, Subject

router = APIRouter(prefix="/collections", tags=["collections"])


@router.get("")
def list_collections(
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
    subject_type: int | None = None,
    status_filter: Annotated[int | None, Query(alias="status", ge=1, le=5)] = None,
    keyword: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    filters = [Collection.user_id == user_id]
    if subject_type is not None:
        filters.append(Subject.subject_type == subject_type)
    if status_filter is not None:
        filters.append(Collection.collection_type == status_filter)
    if keyword:
        pattern = f"%{keyword.strip()}%"
        filters.append(
            or_(
                Subject.name.like(pattern),
                Subject.name_cn.like(pattern),
                Subject.title_english.like(pattern),
                Subject.title_japanese.like(pattern),
            )
        )

    base = select(Collection).join(Collection.subject).where(*filters)
    total = session.scalar(
        select(func.count()).select_from(Collection).join(Collection.subject).where(*filters)
    ) or 0
    records = session.scalars(
        base.order_by(Collection.updated_at.desc()).offset(offset).limit(limit)
    ).unique()
    return {
        "total": total,
        "items": [
            {
                "collection": serialize_collection(record),
                "subject": serialize_subject(record.subject),
            }
            for record in records
        ],
    }


@router.put("/{subject_id}")
def upsert_collection(
    subject_id: int,
    payload: CollectionUpsert,
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
) -> dict:
    subject = session.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="作品不存在")

    collection = session.scalar(
        select(Collection).where(
            Collection.user_id == user_id,
            Collection.subject_id == subject_id,
        )
    )
    if collection is None:
        collection = Collection(user_id=user_id, subject_id=subject_id)
        session.add(collection)
    collection.collection_type = payload.type
    collection.rate = payload.rate
    collection.comment = payload.comment
    collection.ep_status = payload.ep_status
    collection.vol_status = payload.vol_status
    collection.tags = payload.tags
    session.commit()
    session.refresh(collection)
    collection.subject = subject
    return {
        "collection": serialize_collection(collection),
        "subject": serialize_subject(subject),
    }


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection(
    subject_id: int,
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
) -> None:
    collection = session.scalar(
        select(Collection).where(
            Collection.user_id == user_id,
            Collection.subject_id == subject_id,
        )
    )
    if collection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="收藏不存在")
    session.delete(collection)
    session.commit()
