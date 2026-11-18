import httpx
import pytest
from fastapi import HTTPException

import app.ai_client as ai_client


class FakeResponse:
    def __init__(self, status_code=200, payload=None, text="", json_error=False):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text
        self._json_error = json_error

    def json(self):
        if self._json_error:
            raise ValueError("not json")
        return self._payload


class FakeAsyncClient:
    def __init__(self, *, response=None, error=None):
        self.response = response
        self.error = error
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, files=None):
        self.calls.append((url, files))

        if self.error:
            raise self.error

        return self.response


@pytest.mark.asyncio
async def test_call_ai_success(monkeypatch):
    response = FakeResponse(payload={"predicted_species": "Robin"})
    client = FakeAsyncClient(response=response)
    monkeypatch.setattr(ai_client.httpx, "AsyncClient", lambda **kwargs: client)

    result = await ai_client.call_ai("bird.jpg", "image/jpeg", b"data")

    assert result == {"predicted_species": "Robin"}
    assert client.calls[0][0] == "http://ai.test/predict"
    assert client.calls[0][1]["file"] == ("bird.jpg", b"data", "image/jpeg")


@pytest.mark.asyncio
async def test_call_ai_uses_default_content_type(monkeypatch):
    client = FakeAsyncClient(response=FakeResponse(payload={"ok": True}))
    monkeypatch.setattr(ai_client.httpx, "AsyncClient", lambda **kwargs: client)

    await ai_client.call_ai("bird.jpg", None, b"data")

    assert client.calls[0][1]["file"][2] == "application/octet-stream"


@pytest.mark.asyncio
async def test_call_ai_request_error(monkeypatch):
    client = FakeAsyncClient(error=httpx.ConnectError("no route"))
    monkeypatch.setattr(ai_client.httpx, "AsyncClient", lambda **kwargs: client)

    with pytest.raises(HTTPException) as error:
        await ai_client.call_ai("bird.jpg", "image/jpeg", b"data")

    assert error.value.status_code == 502
    assert "AI server unavailable" in error.value.detail


@pytest.mark.asyncio
async def test_call_ai_http_error_with_json_detail(monkeypatch):
    response = FakeResponse(status_code=500, payload={"detail": "model failed"})
    client = FakeAsyncClient(response=response)
    monkeypatch.setattr(ai_client.httpx, "AsyncClient", lambda **kwargs: client)

    with pytest.raises(HTTPException) as error:
        await ai_client.call_ai("bird.jpg", "image/jpeg", b"data")

    assert error.value.status_code == 502
    assert error.value.detail == "AI server error: model failed"


@pytest.mark.asyncio
async def test_call_ai_http_error_with_text(monkeypatch):
    response = FakeResponse(status_code=500, text="plain failure", json_error=True)
    client = FakeAsyncClient(response=response)
    monkeypatch.setattr(ai_client.httpx, "AsyncClient", lambda **kwargs: client)

    with pytest.raises(HTTPException) as error:
        await ai_client.call_ai("bird.jpg", "image/jpeg", b"data")

    assert error.value.detail == "AI server error: plain failure"
