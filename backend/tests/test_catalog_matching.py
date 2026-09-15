from datetime import date, datetime

from aninexus_backend.db import Base, build_engine
from aninexus_backend.importers.catalog_matching import (
    CatalogCandidate,
    decide_subject_match,
    normalize_title,
    plan_subject_matches,
)
from aninexus_backend.models import Subject, SubjectExternalId


def incoming_subject(**overrides) -> dict:
    value = {
        "source_id": "326",
        "subject_type": 2,
        "name": "Cowboy Bebop",
        "name_cn": "星际牛仔",
        "date": date(1998, 10, 24),
    }
    value.update(overrides)
    return value


def candidate(subject_id: int, *titles: str) -> CatalogCandidate:
    return CatalogCandidate(subject_id, 2, date(1998, 10, 24), titles)


def test_normalize_title_handles_width_spacing_case_and_punctuation() -> None:
    assert normalize_title("ＣＯＷＢＯＹ  Bebop!") == "cowboybebop"


def test_unique_title_type_date_match_is_safe_to_auto_link() -> None:
    decision = decide_subject_match(
        incoming_subject(),
        [candidate(10, "Cowboy Bebop", "カウボーイビバップ")],
    )

    assert decision.status == "auto_link"
    assert decision.subject_id == 10
    assert decision.match_method == "normalized_title_type_date"
    assert decision.confidence == 1.0


def test_ambiguous_exact_matches_require_review() -> None:
    decision = decide_subject_match(
        incoming_subject(),
        [candidate(10, "Cowboy Bebop"), candidate(11, "星际牛仔")],
    )

    assert decision.status == "review"
    assert decision.subject_id is None
    assert decision.candidate_ids == (10, 11)


def test_date_mismatch_is_not_automatically_linked() -> None:
    wrong_date = CatalogCandidate(10, 2, date(1999, 10, 24), ("Cowboy Bebop",))

    decision = decide_subject_match(incoming_subject(), [wrong_date])

    assert decision.status == "new_subject"
    assert decision.match_method == "no_exact_match"


def test_existing_external_id_mapping_wins() -> None:
    decision = decide_subject_match(incoming_subject(), [], mapped_subject_id=42)

    assert decision.status == "mapped"
    assert decision.subject_id == 42
    assert decision.match_method == "external_id"


def test_match_planner_reads_candidates_and_existing_mappings() -> None:
    engine = build_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    try:
        with engine.begin() as connection:
            first_id = connection.execute(
                Subject.__table__.insert(),
                {
                    "source": "myanimelist",
                    "source_id": "1",
                    "subject_type": 2,
                    "name": "Cowboy Bebop",
                    "date": date(1998, 10, 24),
                },
            ).inserted_primary_key[0]
            second_id = connection.execute(
                Subject.__table__.insert(),
                {
                    "source": "myanimelist",
                    "source_id": "2",
                    "subject_type": 2,
                    "name": "Mapped Anime",
                    "date": date(2020, 1, 1),
                },
            ).inserted_primary_key[0]
            connection.execute(
                SubjectExternalId.__table__.insert(),
                {
                    "subject_id": second_id,
                    "provider": "bangumi",
                    "external_id": "999",
                    "subject_type": 2,
                    "last_fetched_at": datetime(2026, 9, 15),
                    "raw_hash": "0" * 64,
                },
            )

            decisions = plan_subject_matches(
                connection,
                [incoming_subject(), incoming_subject(source_id="999", name="Other")],
            )

        assert decisions[0].status == "auto_link"
        assert decisions[0].subject_id == first_id
        assert decisions[1].status == "mapped"
        assert decisions[1].subject_id == second_id
    finally:
        engine.dispose()
