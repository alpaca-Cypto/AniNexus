from sqlalchemy import create_engine, insert

from aninexus_backend.db import Base
from aninexus_backend.importers.export_existing_catalog import (
    iter_anime_batches,
    iter_subject_batches,
)
from aninexus_backend.models import Subject


def test_existing_catalog_export_excludes_private_fields_manga_and_nsfw() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(
            insert(Subject),
            [
                {
                    "source": "myanimelist",
                    "source_id": "1",
                    "subject_type": 2,
                    "name": "A",
                    "metadata_json": None,
                },
                {
                    "source": "myanimelist",
                    "source_id": "2",
                    "subject_type": 2,
                    "name": "B",
                    "metadata_json": {"nsfw": True},
                },
                {
                    "source": "myanimelist",
                    "source_id": "3",
                    "subject_type": 1,
                    "name": "C",
                    "metadata_json": None,
                },
            ],
        )

    rows = [row for batch in iter_anime_batches(engine, 1) for row in batch]

    assert len(rows) == 1
    assert rows[0]["source_id"] == "1"
    assert "id" not in rows[0]
    assert "created_at" not in rows[0]
    assert "updated_at" not in rows[0]
    engine.dispose()


def test_existing_catalog_can_export_manga_without_nsfw_or_private_fields() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(insert(Subject), [
            {
                "source": "myanimelist", "source_id": "10", "subject_type": 1,
                "name": "Manga", "metadata_json": None,
            },
            {
                "source": "myanimelist", "source_id": "11", "subject_type": 1,
                "name": "Excluded", "metadata_json": {"nsfw": True},
            },
            {
                "source": "myanimelist", "source_id": "12", "subject_type": 2,
                "name": "Anime", "metadata_json": None,
            },
        ])

    rows = [row for batch in iter_subject_batches(engine, 1, "manga") for row in batch]
    assert [(row["source_id"], row["subject_type"]) for row in rows] == [("10", 1)]
    assert all("id" not in row and "created_at" not in row for row in rows)
    engine.dispose()
