from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from aninexus_backend.api.dependencies import current_user_id
from aninexus_backend.db import get_session
from aninexus_backend.models import Collection, Subject

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
def dashboard_stats(
    session: Annotated[Session, Depends(get_session)],
    user_id: Annotated[int, Depends(current_user_id)],
) -> dict[str, int]:
    rows = session.execute(
        select(Subject.subject_type, func.count(Collection.id))
        .join(Collection, Collection.subject_id == Subject.id)
        .where(Collection.user_id == user_id)
        .group_by(Subject.subject_type)
    )
    counts = {subject_type: count for subject_type, count in rows}
    return {
        "anime": counts.get(2, 0),
        "books": counts.get(1, 0),
        "music": counts.get(3, 0),
        "games": counts.get(4, 0),
        "real": counts.get(6, 0),
        "total": sum(counts.values()),
    }
