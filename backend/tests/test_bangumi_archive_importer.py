from datetime import datetime
from pathlib import Path

from aninexus_backend.importers.bangumi_archive import (
    ArchiveReport,
    convert_archive,
    iter_archive_batches,
    transform_archive_subject,
)
from aninexus_backend.importers.public_catalog import iter_public_bundle

FIXTURE_DIR = Path(__file__).with_name("fixtures") / "bangumi_archive"


def sample_subject(**overrides) -> dict:
    value = {
        "id": 326,
        "type": 2,
        "name": "Cowboy Bebop",
        "name_cn": "星际牛仔",
        "summary": "赏金猎人的太空旅程。",
        "platform": 1,
        "date": "1998-10-24",
        "score": 8.9,
        "rank": 2,
        "nsfw": False,
        "series": False,
        "tags": [{"name": "科幻", "count": 100}],
        "favorite": {"wish": 10, "done": 20},
    }
    value.update(overrides)
    return value


def test_transform_archive_subject_preserves_bangumi_provenance() -> None:
    updated_at = datetime(2026, 9, 8, 21, 3, 36)

    subject = transform_archive_subject(sample_subject(), 1, updated_at)

    assert subject["source"] == "bangumi"
    assert subject["source_id"] == "326"
    assert subject["subject_type"] == 2
    assert subject["name_cn"] == "星际牛仔"
    assert str(subject["score"]) == "8.90"
    assert subject["tags"] == ["科幻"]
    assert subject["metadata_json"]["favorite_total"] == 30
    assert subject["metadata_json"]["nsfw"] is False
    assert subject["source_updated_at"] == updated_at


def test_archive_reader_filters_type_and_nsfw() -> None:
    report = ArchiveReport()

    batches = list(
        iter_archive_batches(FIXTURE_DIR / "subject.jsonlines", report, {2}, batch_size=10)
    )

    assert [item["source_id"] for item in batches[0]] == ["326"]
    assert report.scanned == 3
    assert report.accepted == 1
    assert report.skipped_type == 1
    assert report.skipped_nsfw == 1


def test_archive_conversion_writes_reusable_public_bundle() -> None:
    output = Path(__file__).with_name("test-bangumi-catalog.tmp.gz")
    try:
        report = convert_archive(FIXTURE_DIR, output, kind="anime", limit=1)
        imported = list(iter_public_bundle(output, batch_size=10))
        assert report.accepted == 1
        assert report.checksum
        assert imported[0][0]["source"] == "bangumi"
        assert imported[0][0]["source_id"] == "326"
    finally:
        output.unlink(missing_ok=True)
