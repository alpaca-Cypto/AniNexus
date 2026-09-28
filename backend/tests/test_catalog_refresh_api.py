from datetime import datetime

from fastapi.testclient import TestClient

from aninexus_backend.main import create_app
from aninexus_backend.models import CatalogRefreshItem, CatalogRefreshRun, Subject


def test_public_refresh_page_data_lists_runs_and_subject_links():
    app = create_app("sqlite+pysqlite:///:memory:", auto_create_tables=True)
    with TestClient(app) as client:
        assert client.get("/api/v1/catalog-refresh").json() == {
            "runs": [], "selected_run_id": None, "total": 0, "items": []
        }
        with app.state.session_factory.begin() as session:
            subject = Subject(
                source="bangumi", source_id="326", subject_type=2, name="Cowboy Bebop"
            )
            session.add(subject)
            session.flush()
            subject_id = subject.id
            run = CatalogRefreshRun(
                started_at=datetime(2026, 9, 28, 8),
                finished_at=datetime(2026, 9, 28, 8, 3),
                status="success", scanned=1, created_count=1,
                updated_count=0, linked_count=0, unchanged_count=0, review_count=0,
                skipped_count=0, failed_count=0,
            )
            session.add(run)
            session.flush()
            session.add(CatalogRefreshItem(
                run_id=run.id, subject_id=subject.id, bangumi_id="326",
                subject_type=2, name="Cowboy Bebop", action="created",
            ))

        response = client.get("/api/v1/catalog-refresh")
        assert response.status_code == 200
        data = response.json()
        assert data["runs"][0]["created"] == 1
        assert data["runs"][0]["finished_at"] == "2026-09-28T08:03:00Z"
        assert data["items"][0]["subject_id"] == subject_id
        assert data["items"][0]["action"] == "created"
        changed = client.get("/api/v1/catalog-refresh", params={"action": "changed"})
        assert changed.json()["total"] == 1
        failed = client.get("/api/v1/catalog-refresh", params={"action": "failed"})
        assert failed.json()["total"] == 0
        assert client.get("/api/v1/catalog-refresh", params={"run_id": 999}).status_code == 404
