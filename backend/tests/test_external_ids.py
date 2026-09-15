from datetime import datetime

from sqlalchemy import select

from aninexus_backend.db import Base, build_engine
from aninexus_backend.importers.external_ids import register_subject_external_ids
from aninexus_backend.models import Subject, SubjectExternalId


def test_register_subject_external_ids_is_idempotent() -> None:
    engine = build_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    try:
        with engine.begin() as connection:
            connection.execute(
                Subject.__table__.insert(),
                {
                    "source": "bangumi",
                    "source_id": "326",
                    "subject_type": 2,
                    "name": "Cowboy Bebop",
                },
            )
            record = {
                "source": "bangumi",
                "source_id": "326",
                "subject_type": 2,
                "name": "Cowboy Bebop",
                "source_updated_at": datetime(2026, 9, 8, 21, 3, 36),
            }

            assert register_subject_external_ids(connection, [record]) == 1
            first_hash = connection.scalar(select(SubjectExternalId.raw_hash))

            record["name"] = "Cowboy Bebop Updated"
            assert register_subject_external_ids(connection, [record]) == 1
            mappings = connection.execute(
                select(
                    SubjectExternalId.provider,
                    SubjectExternalId.external_id,
                    SubjectExternalId.subject_type,
                    SubjectExternalId.raw_hash,
                )
            ).all()

        assert len(mappings) == 1
        assert mappings[0].provider == "bangumi"
        assert mappings[0].external_id == "326"
        assert mappings[0].subject_type == 2
        assert mappings[0].raw_hash != first_hash
    finally:
        engine.dispose()


def test_external_ids_allow_provider_ids_to_overlap_across_subject_types() -> None:
    engine = build_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    try:
        records = [
            {
                "source": "myanimelist",
                "source_id": "1",
                "subject_type": subject_type,
                "name": name,
            }
            for subject_type, name in ((1, "Manga"), (2, "Anime"))
        ]
        with engine.begin() as connection:
            connection.execute(Subject.__table__.insert(), records)

            assert register_subject_external_ids(connection, records) == 2
            mappings = connection.execute(
                select(
                    SubjectExternalId.external_id,
                    SubjectExternalId.subject_type,
                ).order_by(SubjectExternalId.subject_type)
            ).all()

        assert mappings == [("1", 1), ("1", 2)]
    finally:
        engine.dispose()
