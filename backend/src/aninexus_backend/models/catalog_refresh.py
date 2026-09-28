from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from aninexus_backend.db import Base

SqlId = BigInteger().with_variant(Integer, "sqlite")


class CatalogRefreshRun(Base):
    __tablename__ = "catalog_refresh_runs"
    __table_args__ = (Index("ix_catalog_refresh_started", "started_at"),)

    id: Mapped[int] = mapped_column(SqlId, primary_key=True, autoincrement=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="running")
    scanned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    linked_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unchanged_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    review_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_kind: Mapped[str | None] = mapped_column(String(100))


class CatalogRefreshItem(Base):
    __tablename__ = "catalog_refresh_items"
    __table_args__ = (
        Index("ix_catalog_refresh_item_run", "run_id", "id"),
        Index("ix_catalog_refresh_item_subject", "subject_id"),
    )

    id: Mapped[int] = mapped_column(SqlId, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(
        ForeignKey("catalog_refresh_runs.id", ondelete="CASCADE"), nullable=False
    )
    subject_id: Mapped[int | None] = mapped_column(
        ForeignKey("subjects.id", ondelete="SET NULL")
    )
    bangumi_id: Mapped[str] = mapped_column(String(64), nullable=False)
    subject_type: Mapped[int | None] = mapped_column(Integer)
    name: Mapped[str | None] = mapped_column(String(500))
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    error_kind: Mapped[str | None] = mapped_column(String(100))
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
