from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from aninexus_backend.api.bangumi import fetch_current_profile, fetch_user_collections
from aninexus_backend.api.dependencies import current_user_id
from aninexus_backend.api.schemas import (
    BangumiCollectionSync,
    BangumiTokenImport,
    BangumiTokenSave,
    CollectionSave,
    CollectionUpsert,
)
from aninexus_backend.api.serializers import serialize_collection, serialize_subject
from aninexus_backend.bangumi_credentials import decrypt_token, encrypt_token
from aninexus_backend.db import get_session
from aninexus_backend.models import BangumiCredential, Collection, Subject, SubjectExternalId

router = APIRouter(prefix="/collections", tags=["collections"])


def _optional_date(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value)) if value else None
    except ValueError:
        return None


def _optional_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _bangumi_image(subject: dict[str, Any]) -> str | None:
    images = subject.get("images")
    if not isinstance(images, dict):
        return None
    for key in ("large", "common", "medium", "small", "grid"):
        value = images.get(key)
        if isinstance(value, str) and value:
            return value.replace("http://", "https://", 1)
    return None


@router.post("")
def save_collection(
    payload: CollectionSave,
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
) -> dict:
    incoming_subject = payload.subject
    subject = session.scalar(
        select(Subject).where(
            Subject.source == incoming_subject.source,
            Subject.source_id == incoming_subject.source_id,
            Subject.subject_type == incoming_subject.type,
        )
    )
    if subject is None:
        subject = Subject(
            source=incoming_subject.source,
            source_id=incoming_subject.source_id,
            subject_type=incoming_subject.type,
            name=incoming_subject.name,
        )
        session.add(subject)
        session.flush()

    subject.name = incoming_subject.name
    subject.name_cn = incoming_subject.name_cn or None
    subject.summary = incoming_subject.summary or None
    subject.date = incoming_subject.date
    subject.platform = incoming_subject.platform or None
    subject.eps = incoming_subject.eps
    subject.volumes = incoming_subject.volumes
    subject.image = incoming_subject.image or None
    subject.score = _optional_decimal(incoming_subject.score)
    subject.tags = incoming_subject.tags

    collection = session.scalar(
        select(Collection).where(
            Collection.user_id == user_id,
            Collection.subject_id == subject.id,
        )
    )
    if collection is None:
        collection = Collection(user_id=user_id, subject_id=subject.id)
        session.add(collection)

    incoming_collection = payload.collection
    collection.collection_type = incoming_collection.type
    collection.rate = incoming_collection.rate
    collection.comment = incoming_collection.comment or None
    collection.ep_status = incoming_collection.ep_status
    collection.vol_status = incoming_collection.vol_status
    collection.tags = incoming_collection.tags
    session.commit()
    session.refresh(collection)
    collection.subject = subject
    return {
        "message": "收藏信息已保存",
        "collection": serialize_collection(collection),
        "subject": serialize_subject(subject),
    }


@router.post("/sync/bgm")
def sync_bangumi_collections(
    payload: BangumiCollectionSync,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
) -> dict:
    if not request.app.state.settings.bangumi_sync_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="收藏同步暂未开放")
    username, records = fetch_user_collections(
        request.app.state.settings,
        subject_type=payload.subject_type,
        collection_type=payload.collection_type,
    )
    return _import_bangumi_records(session, user_id, username, records, payload.subject_type)


@router.post("/import/bangumi")
def import_bangumi_collections(
    payload: BangumiTokenImport,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
) -> dict:
    if payload.access_token is None:
        credential = session.get(BangumiCredential, user_id)
        if credential is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "请先保存或输入 Bangumi Access Token")
        token = decrypt_token(credential.encrypted_token)
    else:
        token = _validated_token(payload.access_token.get_secret_value())
    username, records = fetch_user_collections(
        request.app.state.settings,
        access_token=token,
        subject_type=payload.subject_type,
        collection_type=payload.collection_type,
    )
    return _import_bangumi_records(session, user_id, username, records, payload.subject_type)


def _validated_token(value: str) -> str:
    token = value.strip()
    if not token or "\n" in token or "\r" in token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "请输入有效的 Bangumi Access Token")
    return token


@router.get("/import/bangumi/token")
def get_bangumi_token_status(
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
) -> dict:
    credential = session.get(BangumiCredential, user_id)
    return {
        "configured": credential is not None,
        "username": credential.bangumi_username if credential else None,
    }


@router.put("/import/bangumi/token")
def save_bangumi_token(
    payload: BangumiTokenSave,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
) -> dict:
    token = _validated_token(payload.access_token.get_secret_value())
    profile = fetch_current_profile(request.app.state.settings, access_token=token)
    username = str(profile["username"])
    encrypted = encrypt_token(token)
    credential = session.get(BangumiCredential, user_id)
    if credential is None:
        credential = BangumiCredential(
            user_id=user_id, encrypted_token=encrypted, bangumi_username=username
        )
        session.add(credential)
    else:
        credential.encrypted_token = encrypted
        credential.bangumi_username = username
    session.commit()
    return {"configured": True, "username": username}


@router.delete("/import/bangumi/token", status_code=status.HTTP_204_NO_CONTENT)
def delete_bangumi_token(
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
) -> None:
    credential = session.get(BangumiCredential, user_id)
    if credential is not None:
        session.delete(credential)
        session.commit()


def _import_bangumi_records(
    session: Session,
    user_id: int,
    username: str,
    records: list[dict[str, Any]],
    subject_type: int | None,
) -> dict:
    imported = 0
    for record in records:
        remote_subject = record.get("subject")
        if not isinstance(remote_subject, dict):
            continue
        remote_id = remote_subject.get("id") or record.get("subject_id")
        remote_type = remote_subject.get("type") or record.get("subject_type")
        if not remote_id or not remote_type or not remote_subject.get("name"):
            continue

        subject = session.scalar(
            select(Subject).where(
                Subject.source == "bangumi",
                Subject.source_id == str(remote_id),
                Subject.subject_type == int(remote_type),
            )
        )
        if subject is None:
            subject = session.scalar(
                select(Subject)
                .join(SubjectExternalId, SubjectExternalId.subject_id == Subject.id)
                .where(
                    SubjectExternalId.provider == "bangumi",
                    SubjectExternalId.external_id == str(remote_id),
                    SubjectExternalId.subject_type == int(remote_type),
                )
            )
        if subject is None:
            subject = Subject(
                source="bangumi",
                source_id=str(remote_id),
                subject_type=int(remote_type),
                name=str(remote_subject["name"]),
            )
            session.add(subject)
            session.flush()

        # A mapped MAL subject is the canonical catalog row. Import its personal
        # collection state without replacing catalog fields from another source.
        if subject.source == "bangumi":
            _update_bangumi_subject(subject, remote_subject)

        collection = session.scalar(
            select(Collection).where(
                Collection.user_id == user_id,
                Collection.subject_id == subject.id,
            )
        )
        if collection is None:
            collection = Collection(user_id=user_id, subject_id=subject.id)
            session.add(collection)
        collection.collection_type = int(record.get("type") or 1)
        collection.rate = record.get("rate") or None
        collection.comment = record.get("comment") or None
        collection.ep_status = int(record.get("ep_status") or 0)
        collection.vol_status = int(record.get("vol_status") or 0)
        collection.tags = [str(tag) for tag in (record.get("tags") or [])]
        updated_at = record.get("updated_at")
        if updated_at:
            try:
                collection.updated_at = datetime.fromisoformat(
                    str(updated_at).replace("Z", "+00:00")
                ).replace(tzinfo=None)
            except ValueError:
                pass
        imported += 1

    session.commit()
    return {
        "message": "Bangumi 收藏同步完成",
        "username": username,
        "sync_count": len(records),
        "import_count": imported,
        "subject_type": subject_type,
        "source": "bangumi",
    }


def _update_bangumi_subject(subject: Subject, remote_subject: dict[str, Any]) -> None:
    subject.name = str(remote_subject["name"])
    subject.name_cn = remote_subject.get("name_cn") or None
    subject.summary = remote_subject.get("short_summary") or remote_subject.get("summary")
    subject.date = _optional_date(remote_subject.get("date"))
    subject.platform = remote_subject.get("platform") or None
    subject.eps = remote_subject.get("eps") or remote_subject.get("total_episodes")
    subject.volumes = remote_subject.get("volumes")
    subject.image = _bangumi_image(remote_subject)
    rating = remote_subject.get("rating")
    if isinstance(rating, dict):
        subject.score = _optional_decimal(rating.get("score"))
    subject.rank = remote_subject.get("rank")
    collection_stats = remote_subject.get("collection")
    if isinstance(collection_stats, dict):
        subject.popularity = collection_stats.get("total")
    remote_tags = remote_subject.get("tags")
    if isinstance(remote_tags, list):
        parsed_tags = [
            str(tag.get("name") if isinstance(tag, dict) else tag).strip()
            for tag in remote_tags
            if (tag.get("name") if isinstance(tag, dict) else tag)
        ]
        if parsed_tags:
            subject.tags = parsed_tags


@router.get("")
def list_collections(
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
    subject_type: int | None = None,
    status_filter: Annotated[int | None, Query(alias="status", ge=1, le=5)] = None,
    keyword: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    sort_by: Annotated[
        Literal["updated_at", "score", "date", "rate"], Query()
    ] = "updated_at",
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
    orderings = {
        "updated_at": Collection.updated_at.desc(),
        "score": Subject.score.desc(),
        "date": Subject.date.desc(),
        "rate": Collection.rate.desc(),
    }
    records = session.scalars(
        base.order_by(orderings[sort_by], Collection.id.desc())
        .offset(offset)
        .limit(limit)
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


@router.get("/status")
def get_collection_statuses(
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
    subject_ids: Annotated[list[int], Query(min_length=1, max_length=100)],
) -> dict:
    saved_ids = session.scalars(
        select(Collection.subject_id).where(
            Collection.user_id == user_id,
            Collection.subject_id.in_(subject_ids),
        )
    ).all()
    return {"subject_ids": saved_ids}


@router.get("/{subject_id}")
def get_collection(
    subject_id: int,
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
    return {
        "subject": serialize_subject(subject),
        "collection": serialize_collection(collection) if collection else None,
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
