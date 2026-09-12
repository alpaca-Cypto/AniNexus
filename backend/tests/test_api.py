from fastapi.testclient import TestClient

from aninexus_backend.main import create_app
from aninexus_backend.models import Subject


def test_core_library_workflow() -> None:
    app = create_app("sqlite+pysqlite:///:memory:", auto_create_tables=True)

    with TestClient(app) as client:
        with app.state.session_factory.begin() as session:
            session.add(
                Subject(
                    source="myanimelist",
                    source_id="52991",
                    subject_type=2,
                    name="Sousou no Frieren",
                    name_cn="葬送的芙莉莲",
                    eps=28,
                    score=9.27,
                    tags=["Adventure", "Fantasy"],
                )
            )

        health = client.get("/api/v1/health")
        assert health.status_code == 200
        assert health.json()["database"] == "reachable"
        openapi = client.get("/openapi.json")
        assert openapi.status_code == 200
        assert not any("assistant" in path or "chat" in path for path in openapi.json()["paths"])

        search = client.get("/api/v1/subjects", params={"q": "芙莉莲"})
        assert search.status_code == 200
        assert search.json()["total"] == 1
        subject = search.json()["items"][0]["subject"]
        subject_id = subject["id"]
        assert subject["source_id"] == "52991"

        collection = client.put(
            f"/api/v1/collections/{subject_id}",
            json={"type": 3, "rate": 10, "ep_status": 12, "tags": ["favorite"]},
        )
        assert collection.status_code == 200
        assert collection.json()["collection"]["type"] == 3

        stats = client.get("/api/v1/dashboard/stats")
        assert stats.json() == {
            "anime": 1,
            "books": 0,
            "music": 0,
            "games": 0,
            "real": 0,
            "total": 1,
        }

        schedules = client.post(
            "/api/v1/schedules/bulk-upsert",
            json={
                "items": [
                    {
                        "source": "myanimelist",
                        "source_id": "52991",
                        "subject_type": 2,
                        "day_of_week": 4,
                        "start_time": "20:30",
                        "duration": 1,
                        "watch_type": 4,
                    }
                ]
            },
        )
        assert schedules.status_code == 200
        assert schedules.json()["items"][0]["watch_time"] == "20:30"

        reminder = client.put(
            f"/api/v1/reminders/{subject_id}",
            json={"enabled": True, "channel": "in_app"},
        )
        assert reminder.status_code == 200
        assert reminder.json()["enabled"] is True

        assert client.get("/api/v1/collections").json()["total"] == 1
        assert client.get("/api/v1/schedules").json()["total"] == 1
        assert client.get("/api/v1/reminders").json()["total"] == 1


def test_rejects_invalid_local_user_header() -> None:
    app = create_app("sqlite+pysqlite:///:memory:", auto_create_tables=True)
    with TestClient(app) as client:
        response = client.get("/api/v1/collections", headers={"X-AniNexus-User-Id": "0"})
    assert response.status_code == 422


def test_subject_catalog_paginates_over_the_complete_result_set() -> None:
    app = create_app("sqlite+pysqlite:///:memory:", auto_create_tables=True)
    with TestClient(app) as client:
        with app.state.session_factory.begin() as session:
            session.add_all(
                Subject(
                    source="myanimelist",
                    source_id=str(index),
                    subject_type=2,
                    name=f"Anime {index:02d}",
                    score=10 - index / 100,
                )
                for index in range(1, 41)
            )

        first_page = client.get("/api/v1/subjects", params={"type": 2, "limit": 36})
        second_page = client.get(
            "/api/v1/subjects",
            params={"type": 2, "limit": 36, "offset": 36},
        )

    assert first_page.status_code == 200
    assert first_page.json()["total"] == 40
    assert len(first_page.json()["items"]) == 36
    assert len(second_page.json()["items"]) == 4
