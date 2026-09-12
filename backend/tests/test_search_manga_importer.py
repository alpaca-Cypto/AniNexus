from datetime import date
from decimal import Decimal

from aninexus_backend.importers.search_manga import split_pipe_values, transform_legacy_row


def test_split_pipe_values_ignores_empty_values() -> None:
    assert split_pipe_values("Action| Drama ||Fantasy") == ["Action", "Drama", "Fantasy"]
    assert split_pipe_values(None) == []


def test_transform_anime_row() -> None:
    row = {
        "mal_id": 52991,
        "title": "Sousou no Frieren",
        "title_english": "Frieren: Beyond Journey's End",
        "title_japanese": "葬送のフリーレン",
        "translation_title_zh": "葬送的芙莉莲",
        "translation_synopsis_zh": "冒险结束之后的旅程。",
        "type": "TV",
        "episodes": 28,
        "status": "Finished Airing",
        "aired_from": date(2023, 9, 29),
        "score": 9.27,
        "rank": 1.0,
        "popularity": 20,
        "genres": "Adventure|Drama|Fantasy",
        "themes": "",
        "demographics": "Shounen",
        "synopsis": "A journey after the adventure.",
        "image_url": "https://example.com/frieren.jpg",
        "source": "Manga",
        "duration": "24 min per ep",
        "rating": "PG-13",
        "studios": "Madhouse",
        "producers": "Aniplex|Shogakukan",
    }

    subject = transform_legacy_row("anime", row)

    assert subject["source"] == "myanimelist"
    assert subject["source_id"] == "52991"
    assert subject["subject_type"] == 2
    assert subject["name_cn"] == "葬送的芙莉莲"
    assert subject["summary"] == "冒险结束之后的旅程。"
    assert subject["eps"] == 28
    assert subject["volumes"] is None
    assert subject["score"] == Decimal("9.27")
    assert subject["tags"] == ["Adventure", "Drama", "Fantasy"]
    assert subject["metadata_json"]["studios"] == ["Madhouse"]


def test_transform_manga_row() -> None:
    row = {
        "mal_id": 2,
        "title": "Berserk",
        "type": "Manga",
        "chapters": None,
        "volumes": 42,
        "status": "Publishing",
        "published_from": date(1989, 8, 25),
        "score": "9.46",
        "rank": 1,
        "popularity": 1,
        "genres": "Action|Drama",
        "themes": None,
        "demographics": "Seinen",
        "synopsis": "A dark fantasy story.",
        "image_url": "https://example.com/berserk.jpg",
        "authors": "Miura, Kentarou",
        "serializations": "Young Animal",
    }

    subject = transform_legacy_row("manga", row)

    assert subject["subject_type"] == 1
    assert subject["eps"] is None
    assert subject["volumes"] == 42
    assert subject["metadata_json"]["authors"] == ["Miura, Kentarou"]
