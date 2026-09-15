from __future__ import annotations

import base64
import html
import re
import secrets
import unicodedata
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from aninexus_backend.api.dependencies import current_user_id
from aninexus_backend.auth import (
    hash_captcha,
    hash_password,
    new_session_token,
    token_digest,
    verify_captcha,
    verify_password,
)
from aninexus_backend.db import get_session
from aninexus_backend.models import AuthSession, CaptchaChallenge, User

router = APIRouter(prefix="/auth", tags=["auth"])
CAPTCHA_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
USERNAME_PATTERN = re.compile(r"^[\w\u4e00-\u9fff]+$", re.UNICODE)


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=3, max_length=24)
    password: str = Field(min_length=8, max_length=128)
    captcha_id: str = Field(min_length=20, max_length=64)
    captcha_code: str = Field(min_length=5, max_length=8)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        normalized = unicodedata.normalize("NFKC", value).strip()
        if not USERNAME_PATTERN.fullmatch(normalized):
            raise ValueError("用户名只能包含中文、字母、数字或下划线")
        return normalized


class RegisterRequest(Credentials):
    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        if not re.search(r"[A-Za-z]", value):
            raise ValueError("密码必须包含字母")
        if not any(char.isdigit() for char in value):
            raise ValueError("密码必须包含数字")
        if not any(not char.isalnum() for char in value):
            raise ValueError("密码必须包含特殊字符")
        return value


def _user_payload(user: User) -> dict[str, str | int]:
    return {
        "id": user.id,
        "username": user.username,
        "created_at": user.created_at.isoformat(),
    }


def _captcha_svg(code: str) -> str:
    text = []
    for index, char in enumerate(code):
        x = 19 + index * 24 + secrets.randbelow(5)
        y = 37 + secrets.randbelow(4)
        rotate = secrets.randbelow(17) - 8
        text.append(
            f'<text x="{x}" y="{y}" transform="rotate({rotate} {x} {y})">'
            f"{html.escape(char)}</text>"
        )
    lines = "".join(
        f'<path d="M0 {8 + secrets.randbelow(40)} L160 {8 + secrets.randbelow(40)}" />'
        for _ in range(4)
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="52" '
        'viewBox="0 0 160 52" role="img" aria-label="验证码">'
        '<rect width="160" height="52" rx="10" fill="#f6edf3"/>'
        f'<g fill="none" stroke="#d88bad" stroke-width="1" opacity=".5">{lines}</g>'
        '<g fill="#70204a" font-family="monospace" font-size="28" font-weight="700">'
        f'{"".join(text)}</g></svg>'
    )


def _consume_captcha(session: Session, captcha_id: str, answer: str) -> None:
    challenge = session.get(CaptchaChallenge, captcha_id)
    now = datetime.now(UTC).replace(tzinfo=None)
    valid = bool(
        challenge
        and challenge.expires_at > now
        and verify_captcha(answer, challenge.answer_hash)
    )
    if challenge is not None:
        session.delete(challenge)
        session.commit()
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="验证码错误或已过期，请刷新后重试",
        )


def _create_session(
    session: Session,
    user: User,
    response: Response,
    secure_cookie: bool,
) -> dict[str, object]:
    token, digest = new_session_token()
    session.add(
        AuthSession(
            token_hash=digest,
            user_id=user.id,
            expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(days=30),
        )
    )
    session.commit()
    response.set_cookie(
        key="aninexus_session",
        value=token,
        max_age=30 * 24 * 60 * 60,
        httponly=True,
        secure=secure_cookie,
        samesite="lax",
        path="/",
    )
    return {"access_token": token, "token_type": "bearer", "user": _user_payload(user)}


@router.post("/captcha")
def create_captcha(
    response: Response,
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, str | int]:
    now = datetime.now(UTC).replace(tzinfo=None)
    session.execute(delete(CaptchaChallenge).where(CaptchaChallenge.expires_at <= now))
    code = "".join(secrets.choice(CAPTCHA_ALPHABET) for _ in range(5))
    challenge_id = secrets.token_urlsafe(24)
    session.add(
        CaptchaChallenge(
            challenge_id=challenge_id,
            answer_hash=hash_captcha(code),
            expires_at=now + timedelta(minutes=5),
        )
    )
    session.commit()
    response.headers["Cache-Control"] = "no-store"
    encoded_svg = base64.b64encode(_captcha_svg(code).encode()).decode()
    return {
        "captcha_id": challenge_id,
        "image_data_url": f"data:image/svg+xml;base64,{encoded_svg}",
        "expires_in": 300,
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, object]:
    _consume_captcha(session, payload.captcha_id, payload.captcha_code)
    user = User(
        username=payload.username,
        username_key=payload.username.casefold(),
        password_hash=hash_password(payload.password),
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="这个用户名已被使用",
        ) from exc
    session.refresh(user)
    return _create_session(session, user, response, request.url.scheme == "https")


@router.post("/login")
def login(
    payload: Credentials,
    request: Request,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
) -> dict[str, object]:
    _consume_captcha(session, payload.captcha_id, payload.captcha_code)
    username = unicodedata.normalize("NFKC", payload.username).strip().casefold()
    user = session.scalar(select(User).where(User.username_key == username))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )
    return _create_session(session, user, response, request.url.scheme == "https")


@router.get("/me")
def get_me(
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
) -> dict[str, str | int]:
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录已失效")
    return _user_payload(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> None:
    token = request.cookies.get("aninexus_session", "")
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip() or token
    if token:
        session.execute(delete(AuthSession).where(AuthSession.token_hash == token_digest(token)))
        session.commit()
    response.delete_cookie("aninexus_session", path="/", samesite="lax")
