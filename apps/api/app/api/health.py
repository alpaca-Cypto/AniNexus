from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    """Public liveness response."""

    status: Literal["ok"] = "ok"
    service: str = "aninexus-api"


@router.get("/health", response_model=HealthResponse, summary="Check API liveness")
async def health() -> HealthResponse:
    """Return a lightweight liveness signal without checking dependencies."""

    return HealthResponse()
