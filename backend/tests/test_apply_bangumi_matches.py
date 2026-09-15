import json
from pathlib import Path

import pytest
from sqlalchemy import select

from aninexus_backend.db import Base, build_engine
from aninexus_backend.importers.apply_bangumi_matches import (
    apply_auto_links,
    load_auto_links,
)
from aninexus_backend.models import Subject, SubjectExternalId


def test_load_and_apply_auto_links_without_changing_canonical_subject() -> None:
    plan = Path(__file__).with_name("test-bangumi-plan.tmp.jsonl")
    engine = build_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    try:
        plan.write_text(
            json.dumps({"bangumi_id": "326", "status": "auto_link", "subject_id": 1})
            + "\n"
            + json.dumps({"bangumi_id": "999", "status": "review", "subject_id": None})
            + "\n",
            encoding="utf-8",
        )
        with engine.begin() as connection:
            connection.execute(
                Subject.__table__.insert(),
                {
                    "id": 1,
                    "source": "myanimelist",
                    "source_id": "1",
                    "subject_type": 2,
                    "name": "Cowboy Bebop",
                },
            )
            records = [[{
                "source": "bangumi",
                "source_id": "326",
                "subject_type": 2,
                "name": "Cowboy Bebop",
            }]]

            assert apply_auto_links(
                connection,
                records,
                load_auto_links(plan),
                dry_run=False,
            ) == 1
            mapping = connection.execute(
                select(
                    SubjectExternalId.subject_id,
                    SubjectExternalId.external_id,
                )
            ).one()
            subject_source = connection.scalar(select(Subject.source).where(Subject.id == 1))

        assert mapping.subject_id == 1
        assert mapping.external_id == "326"
        assert subject_source == "myanimelist"
    finally:
        engine.dispose()
        plan.unlink(missing_ok=True)


def test_apply_auto_links_rejects_plan_records_missing_from_archive() -> None:
    engine = build_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    try:
        with engine.connect() as connection:
            with pytest.raises(ValueError, match="missing archive records"):
                apply_auto_links(
                    connection,
                    [],
                    {"326": 1},
                    dry_run=True,
                )
    finally:
        engine.dispose()
