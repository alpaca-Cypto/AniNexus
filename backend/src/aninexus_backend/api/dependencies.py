from datetime import UTC, datetime
from typing import Annotated

from fastapi import Header, HTTPException, Request, status

from aninexus_backend.auth import token_digest
from aninexus_backend.models import AuthSession


def current_user_id(
    request: Request,
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    x_aninexus_user_id: Annotated[
        int | None, Header(alias="X-AniNexus-User-Id")
    ] = None,
) -> int:
    """Resolve an authenticated user, with an in-memory test-only bypass."""

    if request.app.state.testing_auth_bypass:
        if x_aninexus_user_id is not None and x_aninexus_user_id < 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="X-AniNexus-User-Id must be a positive integer",
            )
        user_id = x_aninexus_user_id or request.app.state.default_user_id
        if user_id >= 1:
            return user_id
    token = request.cookies.get("aninexus_session", "")
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip() or token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="请先登录",
            headers={"WWW-Authenticate": "Bearer"},
        )
    factory = request.app.state.session_factory
    with factory() as session:
        auth_session = session.get(AuthSession, token_digest(token))
        now = datetime.now(UTC).replace(tzinfo=None)
        if auth_session is None or auth_session.expires_at <= now:
            if auth_session is not None:
                session.delete(auth_session)
                session.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="登录已失效，请重新登录",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return auth_session.user_id
