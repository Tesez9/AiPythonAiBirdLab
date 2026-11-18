from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

import app.rabbit_client as rabbit_client


@pytest.mark.asyncio
async def test_call_worker_returns_rabbit_result(monkeypatch):
    monkeypatch.setattr(
        rabbit_client,
        "rabbit_request",
        AsyncMock(return_value={"items": [1]}),
    )

    result = await rabbit_client.call_worker({"action": "history"}, lambda: {})

    assert result == {"items": [1]}


@pytest.mark.asyncio
async def test_call_worker_falls_back_when_rabbit_is_down(monkeypatch):
    monkeypatch.setattr(
        rabbit_client,
        "rabbit_request",
        AsyncMock(side_effect=RuntimeError("no rabbit")),
    )

    result = await rabbit_client.call_worker(
        {"action": "history"},
        lambda: {"items": ["fallback"]},
    )

    assert result == {"items": ["fallback"]}


@pytest.mark.asyncio
async def test_call_worker_raises_for_error_payload(monkeypatch):
    monkeypatch.setattr(
        rabbit_client,
        "rabbit_request",
        AsyncMock(return_value={"__error__": "bad request", "__status__": 422}),
    )

    with pytest.raises(HTTPException) as error:
        await rabbit_client.call_worker({"action": "history"}, lambda: {})

    assert error.value.status_code == 422
    assert error.value.detail == "bad request"


@pytest.mark.asyncio
async def test_call_worker_uses_default_error_status(monkeypatch):
    monkeypatch.setattr(
        rabbit_client,
        "rabbit_request",
        AsyncMock(return_value={"__error__": "failed"}),
    )

    with pytest.raises(HTTPException) as error:
        await rabbit_client.call_worker({"action": "history"}, lambda: {})

    assert error.value.status_code == 500
