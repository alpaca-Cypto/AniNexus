from __future__ import annotations

from datetime import time

from pydantic import BaseModel, ConfigDict, Field


class CollectionUpsert(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: int = Field(default=1, ge=1, le=5)
    rate: int | None = Field(default=None, ge=0, le=10)
    comment: str | None = Field(default=None, max_length=5000)
    ep_status: int = Field(default=0, ge=0)
    vol_status: int = Field(default=0, ge=0)
    tags: list[str] = Field(default_factory=list)


class ScheduleUpsert(BaseModel):
    model_config = ConfigDict(extra="ignore")

    source: str = Field(min_length=1, max_length=32)
    source_id: str = Field(min_length=1, max_length=64)
    subject_type: int | None = Field(default=None, ge=1)
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    duration: int = Field(default=1, gt=0, le=52)
    watch_type: int = Field(default=4, ge=1, le=4)


class ScheduleUpsertList(BaseModel):
    items: list[ScheduleUpsert] = Field(max_length=500)


class ReminderUpsert(BaseModel):
    enabled: bool = True
    channel: str = Field(default="in_app", pattern="^(in_app)$")
