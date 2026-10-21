import io
import json

import pytest
from fastapi.testclient import TestClient

from aninexus_backend.api import assistant
from aninexus_backend.assistant import llm
from aninexus_backend.main import create_app


def test_provider_stream_yields_before_reading_the_next_event(monkeypatch):
    first = {"choices": [{"delta": {"content": "你好"}}]}
    consumed = []

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            consumed.append("closed")

        def __iter__(self):
            yield b": heartbeat\r\n"
            yield ("data: " + json.dumps(first) + "\r\n").encode()
            yield b"\r\n"
            consumed.append("next event")
            yield b"data: [DONE]\n"
            yield b"\n"

    def open_response(request, **kwargs):
        assert json.loads(request.data)["stream"] is True
        assert request.get_header("Accept") == "text/event-stream"
        return Response()

    monkeypatch.setattr(llm, "urlopen", open_response)
    stream = llm.stream_chat_completion(
        url="http://localhost/v1/chat/completions", api_key="", model="test",
        messages=[], tools=[], temperature=0, max_tokens=10,
    )
    assert next(stream) == first
    assert consumed == []  # No read-ahead or whole-response buffering.
    assert list(stream) == []
    assert consumed == ["next event", "closed"]


@pytest.mark.parametrize("body", [
    b'data: {"choices": []}\n\n',
    b'data: invalid-json\n\n',
    b'data: {"error": {"message": "failed"}}\n\n',
])
def test_provider_stream_rejects_truncation_and_invalid_events(monkeypatch, body):
    response = io.BytesIO(body)
    monkeypatch.setattr(llm, "urlopen", lambda *_args, **_kwargs: response)
    with pytest.raises(llm.ModelRequestError):
        list(llm.stream_chat_completion(
            url="http://localhost/v1/chat/completions", api_key="", model="test",
            messages=[], tools=[], temperature=0, max_tokens=10,
        ))
    assert response.closed


def test_interrupted_chat_emits_error_without_done_or_completed_history(monkeypatch):
    monkeypatch.setattr(assistant, "request_chat_completion", lambda **kwargs: {
        "choices": [{"message": {"content": "IN_SCOPE"}}],
    })

    def interrupted(**kwargs):
        yield {"choices": [{"delta": {"content": "部分回答"}}]}
        raise llm.ModelRequestError("模型输出意外中断")

    monkeypatch.setattr(assistant, "stream_chat_completion", interrupted)
    app = create_app("sqlite+pysqlite:///:memory:", auto_create_tables=True)
    with TestClient(app) as client:
        response = client.post("/api/v1/chat", json={
            "messages": [{"role": "user", "content": "推荐动画"}],
            "provider": "ollama", "thread_id": "interrupted",
        })
        history = client.get("/api/v1/chat/history?thread_id=interrupted").json()
    assert "部分回答" in response.text
    assert "event: error" in response.text
    assert "event: done" not in response.text
    assert [message["role"] for message in history["messages"]] == ["user"]
