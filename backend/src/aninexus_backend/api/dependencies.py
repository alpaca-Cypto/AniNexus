from typing import Annotated

from fastapi import Header, HTTPException, Request, status


def current_user_id(
    request: Request,
    x_aninexus_user_id: Annotated[
        int | None, Header(alias="X-AniNexus-User-Id")
    ] = None,
) -> int:
    """Temporary local identity until the authentication design is finalized."""

    user_id = (
        x_aninexus_user_id
        if x_aninexus_user_id is not None
        else request.app.state.default_user_id
    )
    if user_id < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="X-AniNexus-User-Id must be a positive integer",
        )
    return user_id
