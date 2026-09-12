from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Date,
    DateTime,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from aninexus_backend.db import Base


class Subject(Base):
    """Normalized catalog record used by AniNexus.

    `source_id` remains a string so later imports can use Bangumi, Douban, or
    another provider without changing the table shape.
    """

    __tablename__ = "subjects"
    __table_args__ = (
        Index(
            "uq_subject_source_identity",
            "source",
            "source_id",
            "subject_type",
            unique=True,
        ),
        Index("ix_subject_name", "name"),
        Index("ix_subject_score", "score"),
        Index("ix_subject_date", "date"),
        Index(
            "ft_subject_search",
            "name",
            "name_cn",
            "title_english",
            "title_japanese",
            "summary",
            mysql_prefix="FULLTEXT",
        ),
    )

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    source_id: Mapped[str] = mapped_column(String(64), nullable=False)
    subject_type: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    name: Mapped[str] = mapped_column(String(500), nullable=False)
    name_cn: Mapped[str | None] = mapped_column(String(500))
    title_english: Mapped[str | None] = mapped_column(String(500))
    title_japanese: Mapped[str | None] = mapped_column(String(500))
    summary: Mapped[str | None] = mapped_column(Text)
    date: Mapped[date | None] = mapped_column(Date)
    platform: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str | None] = mapped_column(String(50))
    eps: Mapped[int | None]
    volumes: Mapped[int | None]
    image: Mapped[str | None] = mapped_column(String(500))
    score: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    rank: Mapped[int | None]
    popularity: Mapped[int | None]
    tags: Mapped[list[str] | None] = mapped_column(JSON)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)

    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
