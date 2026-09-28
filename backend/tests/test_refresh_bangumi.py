from datetime import date, datetime
from http.client import IncompleteRead
from io import BytesIO
from types import SimpleNamespace

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from aninexus_backend.db import Base
from aninexus_backend.importers.external_ids import link_subject_external_ids
from aninexus_backend.importers.refresh_bangumi import (
    _fetch_calendar_with_retry,
    apply_subject,
    candidate_ids,
    fetch_subject,
    refresh_once,
)
from aninexus_backend.models import (
    CatalogRefreshItem,
    CatalogRefreshRun,
    Collection,
    Subject,
    SubjectExternalId,
)


def remote_subject(subject_id=326, **changes):
    value = {
        "id": subject_id,
        "type": 2,
        "name": "Cowboy Bebop",
        "name_cn": "星际牛仔",
        "date": "1998-04-03",
        "summary": "Space bounty hunters",
        "rating": {"score": 8.8},
        "collection": {"total": 123},
        "images": {"large": "http://lain.bgm.tv/pic/cover/test.jpg"},
        "tags": [{"name": "科幻"}],
    }
    value.update(changes)
    return value


def test_daily_refresh_creates_and_updates_bangumi_subject_without_duplicates(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    monkeypatch.setattr(
        "aninexus_backend.importers.refresh_bangumi.fetch_bangumi_calendar",
        lambda _settings: [{"items": [{"id": 326}]}],
    )
    value = remote_subject()
    monkeypatch.setattr(
        "aninexus_backend.importers.refresh_bangumi.fetch_subject",
        lambda _id, _agent: value,
    )
    settings = SimpleNamespace(bangumi_user_agent="AniNexus test")

    assert refresh_once(engine, settings, delay=0)["created"] == 1
    value = remote_subject(summary="Updated summary", rating={"score": 9.1})
    assert refresh_once(engine, settings, delay=0)["updated"] == 1
    assert refresh_once(engine, settings, delay=0)["unchanged"] == 1

    with Session(engine) as session:
        assert session.scalar(select(func.count()).select_from(Subject)) == 1
        subject = session.scalar(select(Subject))
        assert subject.summary == "Updated summary"
        assert str(subject.score) == "9.10"
        assert subject.image.startswith("https://lain.bgm.tv/")
        assert session.scalar(select(func.count()).select_from(SubjectExternalId)) == 1
        runs = session.scalars(select(CatalogRefreshRun).order_by(CatalogRefreshRun.id)).all()
        assert len(runs) == 3
        assert [(run.created_count, run.updated_count, run.unchanged_count) for run in runs] == [
            (1, 0, 0), (0, 1, 0), (0, 0, 1)
        ]
        assert session.scalar(select(func.count()).select_from(CatalogRefreshItem)) == 3


def test_refresh_links_unique_legacy_match_without_replacing_legacy_fields():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        with session.begin():
            session.add(Subject(
                source="myanimelist", source_id="1", subject_type=2,
                name="Cowboy Bebop", summary="Legacy summary", date=date(1998, 4, 3),
            ))
        assert apply_subject(session, remote_subject(), datetime(2026, 9, 28)) == "linked"
        assert (
            apply_subject(session, remote_subject(summary="New"), datetime(2026, 9, 29))
            == "unchanged"
        )
        subject = session.scalar(select(Subject))
        assert subject.summary == "Legacy summary"
        assert session.scalar(select(func.count()).select_from(Subject)) == 1
        link = session.scalar(select(SubjectExternalId))
        assert link.subject_id == subject.id
        assert link.external_id == "326"


def test_candidate_ids_include_active_collection_and_calendar_with_limit():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        with session.begin():
            subject = Subject(source="myanimelist", source_id="7", subject_type=1, name="Book")
            session.add(subject)
            session.flush()
            session.add(Collection(user_id=1, subject_id=subject.id, collection_type=3))
            link_subject_external_ids(session.connection(), [(subject.id, {
                "source": "bangumi", "source_id": "500", "subject_type": 1,
            })])
        assert candidate_ids(session, [{"items": [{"id": 326}, {"id": 326}]}], 2) == ["326", "500"]


def test_refresh_skips_nsfw_and_invalid_subjects():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        assert apply_subject(session, remote_subject(nsfw=True), datetime(2026, 9, 28)) == "skipped"
        assert apply_subject(session, remote_subject(type=4), datetime(2026, 9, 28)) == "skipped"
        assert session.scalar(select(func.count()).select_from(Subject)) == 0


def test_subject_fetch_retries_truncated_response(monkeypatch):
    attempts = 0
    delays = []

    def fake_urlopen(_request, timeout):
        nonlocal attempts
        attempts += 1
        assert timeout == 20
        if attempts == 1:
            raise IncompleteRead(b"partial", 10)
        return BytesIO(b'{"id":326,"type":2,"name":"Cowboy Bebop"}')

    monkeypatch.setattr("aninexus_backend.importers.refresh_bangumi.urlopen", fake_urlopen)
    assert fetch_subject("326", "AniNexus test", sleep=delays.append)["id"] == 326
    assert attempts == 2
    assert delays == [1]


def test_calendar_fetch_retries_transient_failure(monkeypatch):
    attempts = 0

    def fake_calendar(_settings):
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise TimeoutError("temporary")
        return [{"items": [{"id": 326}]}]

    monkeypatch.setattr(
        "aninexus_backend.importers.refresh_bangumi.fetch_bangumi_calendar", fake_calendar
    )
    delays = []
    assert _fetch_calendar_with_retry(None, sleep=delays.append)[0]["items"][0]["id"] == 326
    assert delays == [1, 2]
