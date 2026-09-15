from fastapi.testclient import TestClient

from aninexus_backend.api import assistant as assistant_api
from aninexus_backend.api import auth as auth_api
from aninexus_backend.api import bangumi as bangumi_api
from aninexus_backend.api import collections as collections_api
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
        assert "/api/v1/chat" in openapi.json()["paths"]
        assert "/api/v1/assistant/tools/{tool_name}" in openapi.json()["paths"]
        tools = client.get("/api/v1/assistant/tools")
        assert len(tools.json()["items"]) == 7

        search = client.get("/api/v1/subjects", params={"q": "芙莉莲"})
        assert search.status_code == 200
        assert search.json()["total"] == 1
        subject = search.json()["items"][0]["subject"]
        catalog_item = search.json()["items"][0]
        subject_id = subject["id"]
        assert subject["source_id"] == "52991"
        assert catalog_item["primary_source"] == "myanimelist"
        assert catalog_item["score_source"] == "myanimelist"
        assert catalog_item["data_updated_at"]
        assert catalog_item["is_stale"] is False

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


def test_registration_login_and_logout_require_captcha_and_strong_password(
    monkeypatch,
) -> None:
    monkeypatch.setattr(auth_api.secrets, "choice", lambda _alphabet: "A")
    app = create_app(
        "sqlite+pysqlite:///:memory:",
        auto_create_tables=True,
        testing_auth_bypass=False,
    )

    with TestClient(app) as client:
        protected = client.get("/api/v1/profile")
        weak_captcha = client.post("/api/v1/auth/captcha").json()
        weak = client.post(
            "/api/v1/auth/register",
            json={
                "username": "alpaca_user",
                "password": "password1",
                "captcha_id": weak_captcha["captcha_id"],
                "captcha_code": "AAAAA",
            },
        )
        register_captcha = client.post("/api/v1/auth/captcha").json()
        registered = client.post(
            "/api/v1/auth/register",
            json={
                "username": "alpaca_user",
                "password": "Alpaca#2026",
                "captcha_id": register_captcha["captcha_id"],
                "captcha_code": "AAAAA",
            },
        )
        token = registered.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        me = client.get("/api/v1/auth/me")
        profile = client.get("/api/v1/profile", headers=headers)
        logged_out = client.post("/api/v1/auth/logout")
        expired = client.get("/api/v1/auth/me")

        login_captcha = client.post("/api/v1/auth/captcha").json()
        logged_in = client.post(
            "/api/v1/auth/login",
            json={
                "username": "alpaca_user",
                "password": "Alpaca#2026",
                "captcha_id": login_captcha["captcha_id"],
                "captcha_code": "AAAAA",
            },
        )

    assert protected.status_code == 401
    assert weak.status_code == 422
    assert registered.status_code == 201
    assert "HttpOnly" in registered.headers["set-cookie"]
    assert "SameSite=lax" in registered.headers["set-cookie"]
    assert registered.json()["user"]["username"] == "alpaca_user"
    assert me.status_code == 200
    assert profile.json()["user_id"] == registered.json()["user"]["id"]
    assert logged_out.status_code == 204
    assert expired.status_code == 401
    assert logged_in.status_code == 200


def test_captcha_is_single_use_even_when_the_answer_is_wrong(monkeypatch) -> None:
    monkeypatch.setattr(auth_api.secrets, "choice", lambda _alphabet: "B")
    app = create_app(
        "sqlite+pysqlite:///:memory:",
        auto_create_tables=True,
        testing_auth_bypass=False,
    )

    with TestClient(app) as client:
        captcha = client.post("/api/v1/auth/captcha").json()
        payload = {
            "username": "another_user",
            "password": "Secure#123",
            "captcha_id": captcha["captcha_id"],
            "captcha_code": "WRONG",
        }
        first = client.post("/api/v1/auth/register", json=payload)
        payload["captcha_code"] = "BBBBB"
        second = client.post("/api/v1/auth/register", json=payload)

    assert first.status_code == 422
    assert second.status_code == 422
    assert "验证码错误或已过期" in second.json()["detail"]


def test_user_avatar_upload_is_persisted_and_served() -> None:
    one_pixel_png = (
        "data:image/png;base64,"
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUB"
        "AScY42YAAAAASUVORK5CYII="
    )
    app = create_app("sqlite+pysqlite:///:memory:", auto_create_tables=True)

    with TestClient(app) as client:
        empty_profile = client.get("/api/v1/profile")
        uploaded = client.put(
            "/api/v1/profile/avatar",
            json={"data_url": one_pixel_png},
        )
        avatar = client.get("/api/v1/profile/avatar")
        profile = client.get("/api/v1/profile")

    assert empty_profile.json()["avatar_url"] is None
    assert uploaded.status_code == 200
    assert uploaded.json()["avatar_url"].startswith("/api/v1/profile/avatar?v=")
    assert avatar.status_code == 200
    assert avatar.headers["content-type"] == "image/png"
    assert avatar.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert profile.json()["avatar_url"] == uploaded.json()["avatar_url"]


def test_user_avatar_upload_rejects_mismatched_file_content() -> None:
    app = create_app("sqlite+pysqlite:///:memory:", auto_create_tables=True)
    with TestClient(app) as client:
        response = client.put(
            "/api/v1/profile/avatar",
            json={"data_url": "data:image/png;base64,bm90LWEtcG5n"},
        )

    assert response.status_code == 422
    assert response.json()["detail"] == "文件内容与图片格式不一致"


def test_bangumi_calendar_proxies_validated_upstream_data(monkeypatch) -> None:
    expected = [
        {
            "weekday": {"en": "Mon", "ja": "月耀日", "cn": "星期一", "id": 1},
            "items": [{"id": 42, "name": "Example", "air_weekday": 1}],
        }
    ]
    monkeypatch.setattr(
        bangumi_api,
        "fetch_bangumi_calendar",
        lambda _settings: expected,
    )
    app = create_app("sqlite+pysqlite:///:memory:", auto_create_tables=True)

    with TestClient(app) as client:
        response = client.get("/api/v1/bangumi/calendar")

    assert response.status_code == 200
    assert response.json() == expected


def test_bangumi_calendar_upgrades_cover_urls_for_next_image(monkeypatch) -> None:
    upstream = [
        {
            "weekday": {"en": "Mon", "ja": "月耀日", "cn": "星期一", "id": 1},
            "items": [
                {
                    "id": 42,
                    "name": "Example",
                    "images": {
                        "large": "http://lain.bgm.tv/pic/cover/l/example.jpg",
                        "common": "https://example.com/unchanged.jpg",
                    },
                }
            ],
        }
    ]
    monkeypatch.setattr(bangumi_api, "_request_json", lambda *_args, **_kwargs: upstream)

    calendar = bangumi_api.fetch_bangumi_calendar(bangumi_api.Settings.from_environment())

    assert calendar[0]["items"][0]["images"] == {
        "large": "https://lain.bgm.tv/pic/cover/l/example.jpg",
        "common": "https://example.com/unchanged.jpg",
    }


def test_bangumi_collection_sync_handles_an_empty_account(monkeypatch) -> None:
    monkeypatch.setattr(
        collections_api,
        "fetch_user_collections",
        lambda _settings, **_filters: ("test-user", []),
    )
    app = create_app("sqlite+pysqlite:///:memory:", auto_create_tables=True)

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/collections/sync/bgm",
            json={"subject_type": 2},
        )

    assert response.status_code == 200
    assert response.json()["username"] == "test-user"
    assert response.json()["sync_count"] == 0
    assert response.json()["import_count"] == 0


def test_bangumi_collection_sync_upserts_subject_and_collection(monkeypatch) -> None:
    records = [
        {
            "subject_id": 123,
            "subject_type": 2,
            "type": 3,
            "rate": 9,
            "comment": "很好看",
            "ep_status": 7,
            "vol_status": 0,
            "tags": ["追番"],
            "updated_at": "2026-09-13T10:30:00Z",
            "subject": {
                "id": 123,
                "type": 2,
                "name": "Example Anime",
                "name_cn": "示例动画",
                "short_summary": "简介",
                "date": "2026-07-01",
                "platform": "TV",
                "eps": 12,
                "rank": 88,
                "rating": {"score": 8.6},
                "collection": {"total": 4567},
                "images": {"large": "http://lain.bgm.tv/pic/cover/l/example.jpg"},
            },
        }
    ]
    monkeypatch.setattr(
        collections_api,
        "fetch_user_collections",
        lambda _settings, **_filters: ("test-user", records),
    )
    app = create_app("sqlite+pysqlite:///:memory:", auto_create_tables=True)

    with TestClient(app) as client:
        first = client.post("/api/v1/collections/sync/bgm", json={"subject_type": 2})
        second = client.post("/api/v1/collections/sync/bgm", json={"subject_type": 2})
        collection = client.get("/api/v1/collections", params={"subject_type": 2})

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["import_count"] == 1
    assert collection.json()["total"] == 1
    item = collection.json()["items"][0]
    assert item["subject"]["source"] == "bangumi"
    assert item["subject"]["source_id"] == "123"
    assert item["subject"]["name_cn"] == "示例动画"
    assert item["subject"]["image"].startswith("https://")
    assert item["collection"]["type"] == 3
    assert item["collection"]["ep_status"] == 7


def test_save_collection_creates_and_updates_the_sidebar_record() -> None:
    app = create_app("sqlite+pysqlite:///:memory:", auto_create_tables=True)
    payload = {
        "subject": {
            "source": "bangumi",
            "source_id": "404",
            "type": 2,
            "name": "Example Show",
            "name_cn": "示例作品",
            "summary": "作品简介",
            "date": "2026-09-01",
            "eps": 12,
            "image": "https://example.com/cover.jpg",
            "score": 7.5,
            "tags": ["动画"],
        },
        "collection": {
            "type": 1,
            "rate": None,
            "comment": "准备观看",
            "ep_status": 0,
            "vol_status": 0,
            "tags": ["秋季"],
        },
    }

    with TestClient(app) as client:
        created = client.post("/api/v1/collections", json=payload)
        payload["collection"]["type"] = 3
        payload["collection"]["ep_status"] = 2
        updated = client.post("/api/v1/collections", json=payload)
        sidebar = client.get("/api/v1/collections")

    assert created.status_code == 200
    assert updated.status_code == 200
    assert sidebar.json()["total"] == 1
    item = sidebar.json()["items"][0]
    assert item["subject"]["source_id"] == "404"
    assert item["collection"]["type"] == 3
    assert item["collection"]["ep_status"] == 2


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


def test_subject_search_treats_sql_wildcards_as_literal_text() -> None:
    app = create_app("sqlite+pysqlite:///:memory:", auto_create_tables=True)
    with TestClient(app) as client:
        with app.state.session_factory.begin() as session:
            session.add_all(
                [
                    Subject(
                        source="myanimelist",
                        source_id="wildcard-1",
                        subject_type=2,
                        name="100% Perfect Anime",
                    ),
                    Subject(
                        source="myanimelist",
                        source_id="wildcard-2",
                        subject_type=2,
                        name="Ordinary Anime",
                    ),
                ]
            )

        response = client.get("/api/v1/subjects", params={"q": "%"})

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["subject"]["name"] == "100% Perfect Anime"


def test_bangumi_catalog_mode_filters_the_home_catalog(monkeypatch) -> None:
    monkeypatch.setenv("CATALOG_SOURCE_MODE", "bangumi")
    app = create_app("sqlite+pysqlite:///:memory:", auto_create_tables=True)
    with TestClient(app) as client:
        with app.state.session_factory.begin() as session:
            session.add_all(
                [
                    Subject(
                        source="myanimelist",
                        source_id="legacy-1",
                        subject_type=2,
                        name="Legacy Anime",
                    ),
                    Subject(
                        source="bangumi",
                        source_id="bgm-1",
                        subject_type=2,
                        name="Bangumi Anime",
                    ),
                ]
            )

        response = client.get("/api/v1/subjects", params={"type": 2})

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["primary_source"] == "bangumi"


def test_subject_catalog_hides_nsfw_records_by_default() -> None:
    app = create_app("sqlite+pysqlite:///:memory:", auto_create_tables=True)
    with TestClient(app) as client:
        with app.state.session_factory.begin() as session:
            session.add_all(
                [
                    Subject(
                        source="bangumi",
                        source_id="safe-1",
                        subject_type=2,
                        name="Safe Anime",
                        metadata_json={"nsfw": False},
                    ),
                    Subject(
                        source="bangumi",
                        source_id="nsfw-1",
                        subject_type=2,
                        name="NSFW Anime",
                        metadata_json={"nsfw": True},
                    ),
                ]
            )

        default_response = client.get("/api/v1/subjects", params={"type": 2})
        explicit_response = client.get(
            "/api/v1/subjects", params={"type": 2, "include_nsfw": True}
        )

    assert default_response.json()["total"] == 1
    assert default_response.json()["items"][0]["subject"]["name"] == "Safe Anime"
    assert explicit_response.json()["total"] == 2


def test_similar_subjects_rank_shared_author_and_tags() -> None:
    app = create_app("sqlite+pysqlite:///:memory:", auto_create_tables=True)
    with TestClient(app) as client:
        with app.state.session_factory.begin() as session:
            base = Subject(
                source="myanimelist",
                source_id="100",
                subject_type=1,
                name="Base Manga",
                platform="Manga",
                score=8.0,
                tags=["Fantasy", "Adventure"],
                metadata_json={"authors": ["Example, A"], "themes": ["Isekai"]},
            )
            same_author = Subject(
                source="myanimelist",
                source_id="101",
                subject_type=1,
                name="Same Author",
                platform="Manga",
                score=7.0,
                tags=["Fantasy"],
                metadata_json={"authors": ["Example, A"]},
            )
            tags_only = Subject(
                source="myanimelist",
                source_id="102",
                subject_type=1,
                name="Tags Only",
                platform="Manga",
                score=9.0,
                tags=["Fantasy", "Adventure"],
            )
            wrong_format = Subject(
                source="myanimelist",
                source_id="103",
                subject_type=1,
                name="Wrong Format",
                platform="Light Novel",
                score=10.0,
                tags=["Fantasy", "Adventure"],
                metadata_json={"authors": ["Example, A"]},
            )
            session.add_all([base, same_author, tags_only, wrong_format])
            session.flush()
            base_id = base.id

        response = client.get(f"/api/v1/subjects/{base_id}/similar", params={"limit": 10})

    assert response.status_code == 200
    recommendations = response.json()["items"]
    assert [item["subject"]["name"] for item in recommendations] == [
        "Same Author",
        "Tags Only",
    ]
    assert recommendations[0]["relevance"] == 6
    assert "同作者：Example, A" in recommendations[0]["reasons"]
    assert recommendations[1]["reasons"] == ["共同标签：Fantasy", "共同标签：Adventure"]


def test_similar_subjects_returns_404_for_unknown_subject() -> None:
    app = create_app("sqlite+pysqlite:///:memory:", auto_create_tables=True)
    with TestClient(app) as client:
        response = client.get("/api/v1/subjects/999/similar")
    assert response.status_code == 404


def test_assistant_read_only_tools_cover_library_search_profile_and_recommendations() -> None:
    app = create_app("sqlite+pysqlite:///:memory:", auto_create_tables=True)
    with TestClient(app) as client:
        with app.state.session_factory.begin() as session:
            favorite = Subject(
                source="bangumi",
                source_id="201",
                subject_type=2,
                name="Favorite Fantasy",
                name_cn="最爱的奇幻动画",
                score=8.8,
                tags=["Fantasy", "Adventure"],
                metadata_json={"authors": ["Creator A"], "studios": ["Studio A"]},
            )
            recommendation = Subject(
                source="bangumi",
                source_id="202",
                subject_type=2,
                name="Recommended Fantasy",
                name_cn="推荐的奇幻动画",
                score=8.2,
                tags=["Fantasy"],
                metadata_json={"authors": ["Creator A"], "studios": ["Studio A"]},
            )
            unrelated = Subject(
                source="bangumi",
                source_id="203",
                subject_type=2,
                name="Unrelated Sports",
                score=9.0,
                tags=["Sports"],
            )
            session.add_all([favorite, recommendation, unrelated])
            session.flush()
            favorite_id = favorite.id
            recommendation_id = recommendation.id

        saved = client.put(
            f"/api/v1/collections/{favorite_id}",
            json={"type": 2, "rate": 10, "tags": ["最爱"]},
        )
        assert saved.status_code == 200

        def run_tool(name: str, arguments: dict | None = None) -> dict:
            response = client.post(
                f"/api/v1/assistant/tools/{name}",
                json={"arguments": arguments or {}},
            )
            assert response.status_code == 200
            return response.json()

        overview = run_tool("get_my_collection_overview", {"subject_type": 2})
        assert overview["total"] == 1
        assert overview["rated_count"] == 1
        assert overview["average_user_rate"] == 10

        collections = run_tool(
            "list_my_collections",
            {"min_user_rate": 9, "sort": "user_rate"},
        )
        assert collections["items"][0]["title"] == "最爱的奇幻动画"
        assert "comment" not in collections["items"][0]

        search = run_tool("search_subjects", {"query": "推荐的奇幻"})
        assert search["items"][0]["subject_id"] == recommendation_id

        detail = run_tool(
            "get_subject_detail",
            {"subject_id": favorite_id, "include_credits": True},
        )
        assert detail["collection"]["rate"] == 10
        assert detail["credits"]["creators"] == ["Creator A"]

        similar = run_tool(
            "find_similar_subjects",
            {"subject_id": favorite_id, "dimensions": ["tag", "creator"]},
        )
        assert similar["items"][0]["subject"]["id"] == recommendation_id
        assert similar["items"][0]["already_collected"] is False

        profile = run_tool(
            "get_my_taste_profile",
            {"dimensions": ["tag", "creator", "studio"]},
        )
        assert profile["dimensions"]["tag"][0]["name"] == "Adventure"
        assert profile["dimensions"]["creator"][0]["name"] == "Creator A"

        recommendations = run_tool(
            "recommend_from_my_library",
            {"subject_type": 2, "limit": 5},
        )
        assert recommendations["items"][0]["subject_id"] == recommendation_id
        assert recommendations["items"][0]["reasons"]


def test_assistant_chat_executes_tools_and_persists_visible_messages(monkeypatch) -> None:
    calls = 0

    def fake_completion(**_kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            return {"choices": [{"message": {"role": "assistant", "content": "IN_SCOPE"}}]}
        if calls == 2:
            return {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "call-overview",
                                    "type": "function",
                                    "function": {
                                        "name": "get_my_collection_overview",
                                        "arguments": "{}",
                                    },
                                }
                            ],
                        }
                    }
                ]
            }
        return {"choices": [{"message": {"role": "assistant", "content": "尚未同步收藏。"}}]}

    monkeypatch.setattr(assistant_api, "request_chat_completion", fake_completion)
    app = create_app("sqlite+pysqlite:///:memory:", auto_create_tables=True)
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/chat",
            json={
                "messages": [{"role": "user", "content": "看看我的收藏"}],
                "provider": "ollama",
                "model": "test-model",
                "thread_id": "thread-test",
            },
        )
        history = client.get(
            "/api/v1/chat/history",
            params={"thread_id": "thread-test"},
        )

    assert response.status_code == 200
    assert "event: tool_start" in response.text
    assert "get_my_collection_overview" in response.text
    assert "尚未同步收藏" in response.text
    assert history.json()["messages"] == [
        {"role": "user", "content": "看看我的收藏"},
        {"role": "assistant", "content": "尚未同步收藏。"},
    ]


def test_assistant_rejects_unrelated_questions_without_running_tools(monkeypatch) -> None:
    calls = []

    def fake_completion(**kwargs):
        calls.append(kwargs)
        return {
            "choices": [
                {"message": {"role": "assistant", "content": "OUT_OF_SCOPE"}}
            ]
        }

    monkeypatch.setattr(assistant_api, "request_chat_completion", fake_completion)
    app = create_app("sqlite+pysqlite:///:memory:", auto_create_tables=True)
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/chat",
            json={
                "messages": [{"role": "user", "content": "帮我写一个 Python 爬虫"}],
                "provider": "ollama",
                "model": "test-model",
                "thread_id": "thread-out-of-scope",
            },
        )
        history = client.get(
            "/api/v1/chat/history",
            params={"thread_id": "thread-out-of-scope"},
        )

    assert response.status_code == 200
    assert assistant_api.OUT_OF_SCOPE_REPLY in response.text
    assert "event: tool_start" not in response.text
    assert len(calls) == 1
    assert calls[0]["tools"] == []
    assert calls[0]["temperature"] == 0
    assert history.json()["messages"] == [
        {"role": "user", "content": "帮我写一个 Python 爬虫"},
        {"role": "assistant", "content": assistant_api.OUT_OF_SCOPE_REPLY},
    ]


def test_scope_classifier_uses_recent_context_for_short_followups(monkeypatch) -> None:
    captured_messages = []

    def fake_completion(**kwargs):
        captured_messages.extend(kwargs["messages"])
        return {"choices": [{"message": {"content": "IN_SCOPE"}}]}

    monkeypatch.setattr(assistant_api, "request_chat_completion", fake_completion)

    assert assistant_api._is_in_scope(
        url="http://localhost:11434/v1/chat/completions",
        api_key="",
        model="test-model",
        messages=[
            {"role": "user", "content": "推荐几部奇幻动画"},
            {"role": "assistant", "content": "可以看看葬送的芙莉莲。"},
            {"role": "user", "content": "那第二部呢？"},
        ],
    )
    assert captured_messages[-1]["content"] == "那第二部呢？"
