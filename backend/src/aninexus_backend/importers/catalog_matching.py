from __future__ import annotations

import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any, Literal

from sqlalchemy import select, tuple_
from sqlalchemy.engine import Connection

from aninexus_backend.models import Subject, SubjectExternalId

MatchStatus = Literal["mapped", "auto_link", "review", "new_subject"]


@dataclass(frozen=True, slots=True)
class CatalogCandidate:
    subject_id: int
    subject_type: int
    release_date: date
    titles: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class MatchDecision:
    bangumi_id: str
    status: MatchStatus
    subject_id: int | None
    candidate_ids: tuple[int, ...]
    match_method: str
    confidence: float


def normalize_title(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return "".join(character for character in normalized if character.isalnum())


def _incoming_titles(record: Mapping[str, Any]) -> set[str]:
    return {
        normalized
        for field in ("name", "name_cn", "title_english", "title_japanese")
        if isinstance(value := record.get(field), str)
        and (normalized := normalize_title(value))
    }


def decide_subject_match(
    incoming: Mapping[str, Any],
    candidates: Sequence[CatalogCandidate],
    mapped_subject_id: int | None = None,
) -> MatchDecision:
    bangumi_id = str(incoming["source_id"])
    if mapped_subject_id is not None:
        return MatchDecision(
            bangumi_id=bangumi_id,
            status="mapped",
            subject_id=mapped_subject_id,
            candidate_ids=(mapped_subject_id,),
            match_method="external_id",
            confidence=1.0,
        )

    release_date = incoming.get("date")
    subject_type = incoming.get("subject_type")
    titles = _incoming_titles(incoming)
    if not isinstance(release_date, date) or not titles:
        return MatchDecision(bangumi_id, "new_subject", None, (), "insufficient_data", 0.0)

    matched_ids = tuple(
        sorted(
            candidate.subject_id
            for candidate in candidates
            if candidate.subject_type == subject_type
            and candidate.release_date == release_date
            and titles.intersection(normalize_title(title) for title in candidate.titles)
        )
    )
    if len(matched_ids) == 1:
        return MatchDecision(
            bangumi_id,
            "auto_link",
            matched_ids[0],
            matched_ids,
            "normalized_title_type_date",
            1.0,
        )
    if len(matched_ids) > 1:
        return MatchDecision(
            bangumi_id,
            "review",
            None,
            matched_ids,
            "ambiguous_normalized_title_type_date",
            0.5,
        )
    return MatchDecision(bangumi_id, "new_subject", None, (), "no_exact_match", 0.0)


def plan_subject_matches(
    connection: Connection,
    records: Sequence[Mapping[str, Any]],
) -> list[MatchDecision]:
    bangumi_ids = [str(record["source_id"]) for record in records]
    existing_mappings = {
        (row.external_id, row.subject_type): row.subject_id
        for row in connection.execute(
            select(
                SubjectExternalId.external_id,
                SubjectExternalId.subject_type,
                SubjectExternalId.subject_id,
            ).where(
                SubjectExternalId.provider == "bangumi",
                SubjectExternalId.external_id.in_(bangumi_ids),
            )
        )
    }
    type_date_pairs = {
        (int(record["subject_type"]), record["date"])
        for record in records
        if isinstance(record.get("date"), date)
    }
    candidates_by_pair: dict[tuple[int, date], list[CatalogCandidate]] = {}
    if type_date_pairs:
        rows = connection.execute(
            select(
                Subject.id,
                Subject.subject_type,
                Subject.date,
                Subject.name,
                Subject.name_cn,
                Subject.title_english,
                Subject.title_japanese,
            ).where(
                Subject.source != "bangumi",
                tuple_(Subject.subject_type, Subject.date).in_(type_date_pairs),
            )
        )
        for row in rows:
            titles = tuple(
                title
                for title in (row.name, row.name_cn, row.title_english, row.title_japanese)
                if title
            )
            candidate = CatalogCandidate(row.id, row.subject_type, row.date, titles)
            candidates_by_pair.setdefault((row.subject_type, row.date), []).append(candidate)

    return [
        decide_subject_match(
            record,
            candidates_by_pair.get((int(record["subject_type"]), record.get("date")), ()),
            existing_mappings.get(
                (str(record["source_id"]), int(record["subject_type"]))
            ),
        )
        for record in records
    ]
