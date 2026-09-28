from __future__ import annotations

import math
from collections import deque
from threading import Lock
from time import monotonic

from fastapi import HTTPException, Request, status


class RateLimiter:
    """Small, per-process limiter for the single-worker production API.

    The key uses the direct peer address, never an untrusted forwarded header.
    Behind the Next.js rewrite this is a shared limit for all site users.
    """

    def __init__(self) -> None:
        self._attempts: dict[tuple[str, str], deque[float]] = {}
        self._lock = Lock()

    def retry_after(
        self,
        bucket: str,
        peer: str,
        *,
        limit: int,
        window_seconds: int,
        now: float | None = None,
    ) -> int | None:
        current = monotonic() if now is None else now
        key = (bucket, peer)
        with self._lock:
            if len(self._attempts) > 4096:
                self._attempts = {
                    existing_key: timestamps
                    for existing_key, timestamps in self._attempts.items()
                    if timestamps and timestamps[-1] > current - window_seconds
                }
            attempts = self._attempts.setdefault(key, deque())
            while attempts and attempts[0] <= current - window_seconds:
                attempts.popleft()
            if len(attempts) >= limit:
                return max(1, math.ceil(window_seconds - (current - attempts[0])))
            attempts.append(current)
            return None


def enforce_rate_limit(
    request: Request,
    bucket: str,
    *,
    limit: int,
    window_seconds: int,
) -> None:
    peer = request.client.host if request.client else "unknown"
    retry_after = request.app.state.rate_limiter.retry_after(
        bucket,
        peer,
        limit=limit,
        window_seconds=window_seconds,
    )
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="请求过于频繁，请稍后重试",
            headers={"Retry-After": str(retry_after)},
        )
