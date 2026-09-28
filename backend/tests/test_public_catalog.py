from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from aninexus_backend.importers.public_catalog import (
    build_parser,
    deserialize_subject,
    iter_public_bundle,
    serialize_subject,
    sha256_file,
    write_public_bundle,
)


def test_import_can_require_an_existing_migrated_schema() -> None:
    args = build_parser().parse_args(["--skip-create-database", "--skip-create-tables"])

    assert args.skip_create_database is True
    assert args.skip_create_tables is True


def sample_subject() -> dict:
    return {
        "source": "myanimelist",
        "source_id": "52991",
        "subject_type": 2,
        "name": "Sousou no Frieren",
        "name_cn": "葬送的芙莉莲",
        "date": date(2023, 9, 29),
        "score": Decimal("9.27"),
        "tags": ["Adventure", "Fantasy"],
        "metadata_json": {"studios": ["Madhouse"]},
    }


def test_subject_serialization_round_trip() -> None:
    encoded = serialize_subject(sample_subject())
    decoded = deserialize_subject(encoded, 2)

    assert decoded["date"] == date(2023, 9, 29)
    assert decoded["score"] == Decimal("9.27")
    assert decoded["name_cn"] == "葬送的芙莉莲"


def test_public_bundle_round_trip() -> None:
    output = Path(__file__).with_name("test-public-catalog.tmp.gz")
    try:
        count, checksum = write_public_bundle(output, [[sample_subject()]])
        rows = list(iter_public_bundle(output, batch_size=100))

        assert count == 1
        assert checksum == sha256_file(output)
        assert rows[0][0]["source_id"] == "52991"
    finally:
        output.unlink(missing_ok=True)


def test_public_record_rejects_private_or_unknown_fields() -> None:
    with pytest.raises(ValueError, match="unsupported fields"):
        deserialize_subject(
            '{"source":"myanimelist","source_id":"1","subject_type":2,'
            '"name":"Example","user_id":1}',
            2,
        )
