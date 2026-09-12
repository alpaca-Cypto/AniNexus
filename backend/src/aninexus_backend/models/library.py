from __future__ import annotations

from datetime import datetime, time

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from aninexus_backend.db import Base
from aninexus_backend.models.subject import Subject

SqlId = BigInteger().with_variant(Integer, "sqlite")


class Collection(Base):
    __tablename__ = "collections"
    __table_args__ = (
        UniqueConstraint("user_id", "subject_id", name="uq_collection_user_subject"),
        CheckConstraint("collection_type BETWEEN 1 AND 5", name="ck_collection_type"),
        CheckConstraint("rate IS NULL OR rate BETWEEN 0 AND 10", name="ck_collection_rate"),
        Index("ix_collection_user_type", "user_id", "collection_type"),
    )

    id: Mapped[int] = mapped_column(SqlId, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    subject_id: Mapped[int] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    collection_type: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    rate: Mapped[int | None] = mapped_column(SmallInteger)
    comment: Mapped[str | None] = mapped_column(Text)
    ep_status: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    vol_status: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tags: Mapped[list[str] | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    subject: Mapped[Subject] = relationship(lazy="joined")


class Schedule(Base):
    __tablename__ = "schedules"
    __table_args__ = (
        UniqueConstraint("user_id", "subject_id", name="uq_schedule_user_subject"),
        CheckConstraint("day_of_week BETWEEN 0 AND 6", name="ck_schedule_day"),
        CheckConstraint("watch_type BETWEEN 1 AND 4", name="ck_schedule_watch_type"),
        CheckConstraint("duration > 0", name="ck_schedule_duration"),
        Index("ix_schedule_user_day_time", "user_id", "day_of_week", "start_time"),
    )

    id: Mapped[int] = mapped_column(SqlId, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    subject_id: Mapped[int] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day_of_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    duration: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    watch_type: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    subject: Mapped[Subject] = relationship(lazy="joined")


class UpdateReminder(Base):
    __tablename__ = "update_reminders"
    __table_args__ = (
        UniqueConstraint("user_id", "subject_id", name="uq_reminder_user_subject"),
        Index("ix_reminder_enabled", "user_id", "enabled"),
    )

    id: Mapped[int] = mapped_column(SqlId, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    subject_id: Mapped[int] = mapped_column(
        ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    channel: Mapped[str] = mapped_column(String(32), nullable=False, default="in_app")
    last_notified_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    subject: Mapped[Subject] = relationship(lazy="joined")
