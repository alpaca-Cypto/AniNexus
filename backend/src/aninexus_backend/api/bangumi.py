from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi import Request as FastAPIRequest

from aninexus_backend.api.dependencies import owner_user_id
from aninexus_backend.config import Settings

router = APIRouter(prefix="/bangumi", tags=["bangumi"])
API_BASE_URL = "https://api.bgm.tv"
INSECURE_IMAGE_ORIGIN = "http://lain.bgm.tv/"
SECURE_IMAGE_ORIGIN = "https://lain.bgm.tv/"


def _request_json(
    path: str,
    *,
    user_agent: str,
    access_token: str | None = None,
) -> Any:
    headers = {"Accept": "application/json", "User-Agent": user_agent}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    request = Request(f"{API_BASE_URL}{path}", headers=headers)
    try:
        with urlopen(request, timeout=20) as response:  # noqa: S310 - fixed trusted host
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        if exc.code == status.HTTP_401_UNAUTHORIZED:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Bangumi Access Token 无效或已经过期。",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Bangumi API 返回异常状态：{exc.code}",
        ) from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="暂时无法连接 Bangumi API。",
        ) from exc


def fetch_bangumi_calendar(settings: Settings) -> list[dict[str, Any]]:
    # /calendar is public. Do not let an expired personal token break it.
    payload = _request_json("/calendar", user_agent=settings.bangumi_user_agent)
    if not isinstance(payload, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Bangumi 日历返回了无法识别的数据格式。",
        )
    for day in payload:
        if not isinstance(day, dict) or not isinstance(day.get("items"), list):
            continue
        for item in day["items"]:
            if not isinstance(item, dict) or not isinstance(item.get("images"), dict):
                continue
            item["images"] = {
                size: (
                    url.replace(INSECURE_IMAGE_ORIGIN, SECURE_IMAGE_ORIGIN, 1)
                    if isinstance(url, str) and url.startswith(INSECURE_IMAGE_ORIGIN)
                    else url
                )
                for size, url in item["images"].items()
            }
    return payload


def fetch_current_profile(settings: Settings, *, access_token: str | None = None) -> dict[str, Any]:
    token = access_token if access_token is not None else settings.bangumi_access_token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="尚未配置 Bangumi Access Token。",
        )
    payload = _request_json(
        "/v0/me",
        user_agent=settings.bangumi_user_agent,
        access_token=token,
    )
    if not isinstance(payload, dict) or not payload.get("username"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Bangumi 用户资料返回了无法识别的数据格式。",
        )
    return payload


def fetch_user_collections(
    settings: Settings,
    *,
    access_token: str | None = None,
    subject_type: int | None = None,
    collection_type: int | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    profile = fetch_current_profile(settings, access_token=access_token)
    token = access_token if access_token is not None else settings.bangumi_access_token
    username = str(profile["username"])
    records: list[dict[str, Any]] = []
    offset = 0
    page_size = 100
    while True:
        query: dict[str, int] = {"limit": page_size, "offset": offset}
        if subject_type is not None:
            query["subject_type"] = subject_type
        if collection_type is not None:
            query["type"] = collection_type
        payload = _request_json(
            f"/v0/users/{quote(username, safe='')}/collections?{urlencode(query)}",
            user_agent=settings.bangumi_user_agent,
            access_token=token,
        )
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Bangumi 收藏返回了无法识别的数据格式。",
            )
        page = [item for item in payload["data"] if isinstance(item, dict)]
        records.extend(page)
        total = int(payload.get("total") or 0)
        if not page or len(records) >= total:
            break
        offset += len(page)
    return username, records


@router.get("/calendar")
def get_bangumi_calendar(request: FastAPIRequest) -> list[dict[str, Any]]:
    if not request.app.state.settings.bangumi_sync_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="追番日历暂未开放")
    return fetch_bangumi_calendar(request.app.state.settings)


@router.get("/status")
def get_bangumi_status(
    request: FastAPIRequest,
    _owner_id: int = Depends(owner_user_id),
) -> dict[str, Any]:
    settings: Settings = request.app.state.settings
    if not settings.bangumi_access_token:
        return {"configured": False, "connected": False, "username": None}
    try:
        profile = fetch_current_profile(settings)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_401_UNAUTHORIZED:
            return {
                "configured": True,
                "connected": False,
                "username": None,
                "detail": exc.detail,
            }
        raise
    return {
        "configured": True,
        "connected": True,
        "username": profile.get("username") if isinstance(profile, dict) else None,
    }
