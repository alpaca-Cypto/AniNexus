from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, LargeBinary, String
from sqlalchemy.dialects.mysql import MEDIUMBLOB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from aninexus_backend.db import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    avatar_mime: Mapped[str | None] = mapped_column(String(32))
    avatar_data: Mapped[bytes | None] = mapped_column(
        LargeBinary().with_variant(MEDIUMBLOB, "mysql")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
