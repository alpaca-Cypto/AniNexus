from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ToolInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CollectionOverviewInput(ToolInput):
    subject_type: int | None = Field(default=None, ge=1)


class CollectionListInput(ToolInput):
    subject_type: int | None = Field(default=None, ge=1)
    collection_status: int | None = Field(default=None, ge=1, le=5)
    keyword: str | None = Field(default=None, max_length=100)
    min_user_rate: int | None = Field(default=None, ge=0, le=10)
    sort: Literal["updated", "user_rate", "subject_score"] = "updated"
    limit: int = Field(default=10, ge=1, le=30)


class SubjectSearchInput(ToolInput):
    query: str = Field(min_length=1, max_length=100)
    subject_type: int | None = Field(default=None, ge=1)
    year_from: int | None = Field(default=None, ge=1900, le=2200)
    score_from: float | None = Field(default=None, ge=0, le=10)
    limit: int = Field(default=8, ge=1, le=20)


class SubjectDetailInput(ToolInput):
    subject_id: int = Field(ge=1)
    include_credits: bool = False


SimilarityDimension = Literal[
    "tag", "story", "creator", "staff", "studio", "voice_actor"
]


class SimilarSubjectsInput(ToolInput):
    subject_id: int = Field(ge=1)
    dimensions: list[SimilarityDimension] = Field(default_factory=list, max_length=6)
    exclude_collected: bool = True
    limit: int = Field(default=10, ge=1, le=20)


ProfileDimension = Literal["tag", "creator", "staff", "studio", "voice_actor", "year"]


class TasteProfileInput(ToolInput):
    subject_type: int | None = Field(default=None, ge=1)
    dimensions: list[ProfileDimension] = Field(default_factory=list, max_length=6)
    top_n: int = Field(default=8, ge=1, le=20)


class LibraryRecommendationInput(ToolInput):
    subject_type: int = Field(default=2, ge=1)
    seed_subject_ids: list[int] = Field(default_factory=list, max_length=10)
    dimensions: list[SimilarityDimension] = Field(default_factory=list, max_length=6)
    min_subject_score: float = Field(default=6, ge=0, le=10)
    exclude_collected: bool = True
    limit: int = Field(default=8, ge=1, le=20)

    @model_validator(mode="after")
    def unique_seed_ids(self) -> LibraryRecommendationInput:
        self.seed_subject_ids = list(dict.fromkeys(self.seed_subject_ids))
        return self
