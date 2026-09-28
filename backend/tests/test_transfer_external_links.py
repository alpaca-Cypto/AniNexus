from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy import create_engine, insert, select

from aninexus_backend.db import Base
from aninexus_backend.importers.external_ids import link_subject_external_ids
from aninexus_backend.importers.transfer_external_links import (
    export_links,
    import_links,
    read_links,
)
from aninexus_backend.models import Subject, SubjectExternalId


def test_links_follow_subject_identity_not_old_database_id() -> None:
    old = create_engine("sqlite:///:memory:")
    new = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(old)
    Base.metadata.create_all(new)
    with old.begin() as connection:
        subject_id = connection.execute(
            insert(Subject).values(
                source="myanimelist", source_id="10", subject_type=2, name="Anime"
            )
        ).inserted_primary_key[0]
        link_subject_external_ids(
            connection,
            [
                (
                    subject_id,
                    {
                        "source": "bangumi",
                        "source_id": "99",
                        "subject_type": 2,
                        "source_updated_at": datetime(2026, 1, 1),
                    },
                )
            ],
        )
    with new.begin() as connection:
        connection.execute(
            insert(Subject).values(
                source="myanimelist", source_id="5", subject_type=2, name="Other"
            )
        )
        new_id = connection.execute(
            insert(Subject).values(
                source="myanimelist", source_id="10", subject_type=2, name="Anime"
            )
        ).inserted_primary_key[0]

    bundle = Path(__file__).with_name("test-external-links.tmp.gz")
    try:
        count, checksum = export_links(old, bundle)
        records = read_links(bundle)
    finally:
        bundle.unlink(missing_ok=True)
    assert count == 1
    assert len(checksum) == 64
    assert set(records[0]) == {
        "source",
        "source_id",
        "provider",
        "external_id",
        "subject_type",
        "provider_updated_at",
    }
    assert import_links(new, records, dry_run=True) == 1
    assert import_links(new, records) == 1
    with new.connect() as connection:
        mapped_id = connection.scalar(
            select(SubjectExternalId.subject_id).where(
                SubjectExternalId.provider == "bangumi",
                SubjectExternalId.external_id == "99",
            )
        )
    assert mapped_id == new_id
    assert mapped_id != subject_id
    old.dispose()
    new.dispose()


def test_conflicting_existing_link_is_not_overwritten() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        first = connection.execute(
            insert(Subject).values(source="myanimelist", source_id="1", subject_type=2, name="A")
        ).inserted_primary_key[0]
        connection.execute(
            insert(Subject).values(source="myanimelist", source_id="2", subject_type=2, name="B")
        )
        link_subject_external_ids(
            connection, [(first, {"source": "bangumi", "source_id": "99", "subject_type": 2})]
        )

    with pytest.raises(ValueError, match="already points to another"):
        import_links(
            engine,
            [
                {
                    "source": "myanimelist",
                    "source_id": "2",
                    "provider": "bangumi",
                    "external_id": "99",
                    "subject_type": 2,
                    "provider_updated_at": None,
                }
            ],
        )
    engine.dispose()
