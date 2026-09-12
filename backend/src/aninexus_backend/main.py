from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from sqlalchemy.engine import make_url

from aninexus_backend import models as models  # noqa: F401
from aninexus_backend.api.collections import router as collections_router
from aninexus_backend.api.dashboard import router as dashboard_router
from aninexus_backend.api.health import router as health_router
from aninexus_backend.api.reminders import router as reminders_router
from aninexus_backend.api.schedules import router as schedules_router
from aninexus_backend.api.subjects import router as subjects_router
from aninexus_backend.config import Settings
from aninexus_backend.db import Base, build_engine, build_session_factory, ensure_mysql_database


def create_app(
    database_url: str | None = None,
    auto_create_tables: bool | None = None,
) -> FastAPI:
    settings = Settings.from_environment()
    resolved_url = database_url if database_url is not None else settings.database_url
    should_create = (
        auto_create_tables if auto_create_tables is not None else settings.auto_create_tables
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if not resolved_url:
            raise RuntimeError("DATABASE_URL is required to start the AniNexus API")
        if should_create and make_url(resolved_url).get_backend_name() == "mysql":
            ensure_mysql_database(resolved_url)
        engine = build_engine(resolved_url)
        if should_create:
            Base.metadata.create_all(engine)
        app.state.engine = engine
        app.state.session_factory = build_session_factory(engine)
        app.state.default_user_id = settings.default_user_id
        try:
            yield
        finally:
            engine.dispose()

    app = FastAPI(
        title="AniNexus API",
        version="0.1.0",
        description="Catalog, collection, schedule, and update reminder APIs.",
        lifespan=lifespan,
    )
    api_prefix = "/api/v1"
    app.include_router(health_router, prefix=api_prefix)
    app.include_router(subjects_router, prefix=api_prefix)
    app.include_router(collections_router, prefix=api_prefix)
    app.include_router(schedules_router, prefix=api_prefix)
    app.include_router(reminders_router, prefix=api_prefix)
    app.include_router(dashboard_router, prefix=api_prefix)

    @app.get("/")
    def root() -> dict[str, str]:
        return {"name": "AniNexus API", "docs": "/docs", "health": "/api/v1/health"}

    return app


app = create_app()


def run() -> None:
    uvicorn.run("aninexus_backend.main:app", host="0.0.0.0", port=8000, reload=False)
