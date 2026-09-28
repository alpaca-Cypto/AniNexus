from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from aninexus_backend.db import get_session
from aninexus_backend.models import CatalogRefreshItem, CatalogRefreshRun, Subject

router = APIRouter(prefix="/catalog-refresh", tags=["catalog-refresh"])
Action = Literal[
    "all", "changed", "created", "updated", "linked", "unchanged", "review", "skipped", "failed"
]


def _timestamp(value) -> str | None:
    return value.isoformat() + "Z" if value else None


def _run_summary(session: Session, run: CatalogRefreshRun) -> dict:
    counts = {
        "created": run.created_count,
        "updated": run.updated_count,
        "linked": run.linked_count,
        "unchanged": run.unchanged_count,
        "review": run.review_count,
        "skipped": run.skipped_count,
        "failed": run.failed_count,
    }
    if run.status == "running":
        counts = dict.fromkeys(counts, 0)
        for action, count in session.execute(
            select(CatalogRefreshItem.action, func.count())
            .where(CatalogRefreshItem.run_id == run.id)
            .group_by(CatalogRefreshItem.action)
        ):
            if action in counts:
                counts[action] = count
    return {
        "id": run.id,
        "started_at": _timestamp(run.started_at),
        "finished_at": _timestamp(run.finished_at),
        "status": run.status,
        "scanned": sum(counts.values()) if run.status == "running" else run.scanned,
        **counts,
        "error_kind": run.error_kind,
    }


@router.get("")
def list_catalog_refreshes(
    session: Annotated[Session, Depends(get_session)],
    run_id: Annotated[int | None, Query(ge=1)] = None,
    action: Action = "all",
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    runs = session.scalars(
        select(CatalogRefreshRun).order_by(CatalogRefreshRun.id.desc()).limit(12)
    ).all()
    selected = (
        session.get(CatalogRefreshRun, run_id)
        if run_id is not None else runs[0] if runs else None
    )
    if run_id is not None and selected is None:
        raise HTTPException(status_code=404, detail="刷新记录不存在")
    if selected is None:
        return {"runs": [], "selected_run_id": None, "total": 0, "items": []}

    filters = [CatalogRefreshItem.run_id == selected.id]
    if action == "changed":
        filters.append(CatalogRefreshItem.action.in_(("created", "updated", "linked")))
    elif action != "all":
        filters.append(CatalogRefreshItem.action == action)
    total = session.scalar(
        select(func.count()).select_from(CatalogRefreshItem).where(*filters)
    ) or 0
    rows = session.execute(
        select(CatalogRefreshItem, Subject.image)
        .outerjoin(Subject, Subject.id == CatalogRefreshItem.subject_id)
        .where(*filters)
        .order_by(CatalogRefreshItem.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return {
        "runs": [_run_summary(session, run) for run in runs],
        "selected_run_id": selected.id,
        "total": total,
        "items": [
            {
                "id": item.id,
                "subject_id": item.subject_id,
                "bangumi_id": item.bangumi_id,
                "subject_type": item.subject_type,
                "name": item.name,
                "action": item.action,
                "error_kind": item.error_kind,
                "recorded_at": _timestamp(item.recorded_at),
                "image": image,
            }
            for item, image in rows
        ],
    }
