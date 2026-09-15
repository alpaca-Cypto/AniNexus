from __future__ import annotations

import base64
import binascii
import hashlib
import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from aninexus_backend.api.dependencies import current_user_id
from aninexus_backend.db import get_session
from aninexus_backend.models import UserProfile

router = APIRouter(prefix="/profile", tags=["profile"])

MAX_AVATAR_BYTES = 2 * 1024 * 1024
DATA_URL_PATTERN = re.compile(
    r"^data:(image/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$"
)


class AvatarUpload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    data_url: str = Field(min_length=32, max_length=3_000_000)


def _verified_avatar(data_url: str) -> tuple[str, bytes]:
    match = DATA_URL_PATTERN.fullmatch(data_url)
    if match is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="仅支持 JPEG、PNG、WebP 或 GIF 图片",
        )
    mime, encoded = match.groups()
    try:
        image = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="头像图片数据无效",
        ) from exc
    if not image or len(image) > MAX_AVATAR_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="头像压缩后不能超过 2 MB",
        )

    signatures = {
        "image/jpeg": image.startswith(b"\xff\xd8\xff"),
        "image/png": image.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": len(image) >= 12
        and image.startswith(b"RIFF")
        and image[8:12] == b"WEBP",
        "image/gif": image.startswith((b"GIF87a", b"GIF89a")),
    }
    if not signatures[mime]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="文件内容与图片格式不一致",
        )
    return mime, image


def _avatar_url(profile: UserProfile) -> str | None:
    if not profile.avatar_data:
        return None
    version = hashlib.sha256(profile.avatar_data).hexdigest()[:12]
    return f"/api/v1/profile/avatar?v={version}"


@router.get("")
def get_profile(
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
) -> dict[str, str | int | None]:
    profile = session.get(UserProfile, user_id)
    return {
        "user_id": user_id,
        "avatar_url": _avatar_url(profile) if profile else None,
    }


@router.get("/avatar")
def get_avatar(
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
) -> Response:
    profile = session.get(UserProfile, user_id)
    if profile is None or not profile.avatar_data or not profile.avatar_mime:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="尚未上传头像")
    return Response(
        content=profile.avatar_data,
        media_type=profile.avatar_mime,
        headers={
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.put("/avatar")
def update_avatar(
    payload: AvatarUpload,
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
) -> dict[str, str | int | None]:
    mime, image = _verified_avatar(payload.data_url)
    profile = session.get(UserProfile, user_id)
    if profile is None:
        profile = UserProfile(user_id=user_id)
        session.add(profile)
    profile.avatar_mime = mime
    profile.avatar_data = image
    session.commit()
    session.refresh(profile)
    return {"user_id": user_id, "avatar_url": _avatar_url(profile)}


@router.delete("/avatar", status_code=status.HTTP_204_NO_CONTENT)
def delete_avatar(
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
) -> Response:
    profile = session.get(UserProfile, user_id)
    if profile is not None:
        profile.avatar_mime = None
        profile.avatar_data = None
        session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
