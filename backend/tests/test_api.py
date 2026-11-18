import io
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

import app.routers.analyses as analyses_router
import app.routers.payments as payments_router
import app.routers.system as system_router
import app.services as services
from app.main import app
from app.models import Analysis, BirdInfo, UsedTransaction, WalletCredit

ADDRESS = "0xAbCdEf0000000000000000000000000000000001"
OTHER_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678"
TX_HASH = "0x" + "ab" * 32


def add_analysis(db, **overrides):
    values = {
        "image_name": "bird.jpg",
        "predicted_species": "Robin",
        "confidence": 0.8,
        "analysis_date": datetime(2026, 1, 1, 12, 0),
        "description": "desc",
        "source": "src",
    }
    values.update(overrides)
    row = Analysis(**values)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def add_wallet(db, address=ADDRESS, credits=0):
    wallet = WalletCredit(wallet_address=address.lower(), credits=credits)
    db.add(wallet)
    db.commit()
    return wallet


def add_transaction(db, tx_hash=TX_HASH, address=ADDRESS, credits=5):
    transaction = UsedTransaction(
        transaction_hash=tx_hash,
        wallet_address=address.lower(),
        credits=credits,
        amount_wei="2000000000000000",
        block_number=1,
        chain_id=31337,
    )
    db.add(transaction)
    db.commit()
    return transaction


def fallback_worker(monkeypatch, module):
    async def call_worker(data, fallback):
        return fallback()

    monkeypatch.setattr(module, "call_worker", call_worker)


def fake_ai(monkeypatch, payload=None):
    monkeypatch.setattr(
        services,
        "call_ai",
        AsyncMock(
            return_value=payload
            or {
                "predicted_species": "Robin",
                "confidence": 0.9,
                "top3": [{"species": "Robin", "confidence": 0.9}],
            }
        ),
    )


class FakeAiResponse:
    status_code = 200

    def json(self):
        return {"status": "ok"}


class FakeAiClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url):
        return FakeAiResponse()


class BrokenAiClient(FakeAiClient):
    async def get(self, url):
        raise system_router.httpx.ConnectError("ai down")


def test_root(client):
    response = client.get("/")

    assert response.status_code == 200
    assert response.json()["service"] == "bird-central-server"


def test_health_ok(client, monkeypatch):
    monkeypatch.setattr(system_router.httpx, "AsyncClient", FakeAiClient)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["database"] == "ok"


def test_health_degraded_when_ai_is_unavailable(client, monkeypatch):
    monkeypatch.setattr(system_router.httpx, "AsyncClient", BrokenAiClient)

    response = client.get("/health")

    assert response.json()["status"] == "degraded"
    assert "unavailable" in response.json()["ai_server"]


def test_health_degraded_on_non_200_ai_response(client, monkeypatch):
    class ErrorAiResponse(FakeAiResponse):
        status_code = 500

    class ErrorAiClient(FakeAiClient):
        async def get(self, url):
            return ErrorAiResponse()

    monkeypatch.setattr(system_router.httpx, "AsyncClient", ErrorAiClient)

    assert client.get("/health").json()["ai_server"] == "http 500"


def test_health_degraded_when_ai_is_not_ready(client, monkeypatch):
    class NotReadyAiResponse(FakeAiResponse):
        def json(self):
            return {"status": "loading"}

    class NotReadyAiClient(FakeAiClient):
        async def get(self, url):
            return NotReadyAiResponse()

    monkeypatch.setattr(system_router.httpx, "AsyncClient", NotReadyAiClient)

    assert client.get("/health").json()["ai_server"] == "not ready"


def test_lifespan_runs_and_seeds(client):
    with TestClient(app) as lifespan_client:
        assert lifespan_client.get("/").status_code == 200


def test_list_analyses_uses_fallback(client, db, monkeypatch):
    add_analysis(db, predicted_species="Robin")
    add_analysis(db, predicted_species="Sparrow", image_name="sparrow.png")
    fallback_worker(monkeypatch, analyses_router)

    response = client.get("/api/analyses?limit=10")

    assert response.status_code == 200
    assert response.json()["total"] == 2


def test_list_analyses_search(client, db, monkeypatch):
    add_analysis(db, predicted_species="Robin")
    add_analysis(db, predicted_species="Sparrow", image_name="sparrow.png")
    fallback_worker(monkeypatch, analyses_router)

    response = client.get("/api/analyses?query=sparrow")

    assert response.json()["total"] == 1


def test_get_analysis(client, db, monkeypatch):
    row = add_analysis(db)
    fallback_worker(monkeypatch, analyses_router)

    response = client.get(f"/api/analyses/{row.id}")

    assert response.status_code == 200
    assert response.json()["predicted_species"] == "Robin"


def test_get_analysis_not_found(client, monkeypatch):
    fallback_worker(monkeypatch, analyses_router)

    response = client.get("/api/analyses/999")

    assert response.status_code == 404


def test_create_analysis(client, db, upload_dir, monkeypatch):
    fake_ai(monkeypatch)
    db.add(BirdInfo(species="Robin", description="Robin info"))
    db.commit()

    response = client.post(
        "/api/analyses",
        files={"file": ("bird.jpg", b"image-bytes", "image/jpeg")},
    )

    assert response.status_code == 201
    assert response.json()["predicted_species"] == "Robin"
    assert response.json()["description"] == "Robin info"


def test_create_analysis_rejects_invalid_extension(client):
    response = client.post(
        "/api/analyses",
        files={"file": ("bird.gif", b"image-bytes", "image/gif")},
    )

    assert response.status_code == 400


def test_create_analysis_requires_credits(client, db, monkeypatch):
    monkeypatch.setattr(services, "PAYMENT_ENABLED", True)

    response = client.post(
        "/api/analyses",
        files={"file": ("bird.jpg", b"image-bytes", "image/jpeg")},
        data={"wallet_address": ADDRESS},
    )

    assert response.status_code == 402


def test_batch_analysis_collects_errors(client, db, upload_dir, monkeypatch):
    fake_ai(monkeypatch)

    response = client.post(
        "/api/analyses/batch",
        files=[
            ("files", ("bird.jpg", b"image-bytes", "image/jpeg")),
            ("files", ("bird.gif", b"image-bytes", "image/gif")),
        ],
    )

    body = response.json()

    assert response.status_code == 201
    assert body["total"] == 1
    assert len(body["errors"]) == 1
    assert body["errors"][0]["filename"] == "bird.gif"


def test_batch_analysis_returns_credits_left(client, db, upload_dir, monkeypatch):
    monkeypatch.setattr(services, "PAYMENT_ENABLED", True)
    monkeypatch.setattr(analyses_router, "PAYMENT_ENABLED", True)
    fake_ai(monkeypatch)
    add_wallet(db, credits=2)

    response = client.post(
        "/api/analyses/batch",
        files=[
            ("files", ("bird.jpg", b"image-bytes", "image/jpeg")),
            ("files", ("second.png", b"image-bytes", "image/png")),
        ],
        data={"wallet_address": ADDRESS},
    )

    assert response.status_code == 201
    assert response.json()["credits_left"] == 0


def test_delete_analysis(client, db, upload_dir):
    stored = upload_dir / "saved.jpg"
    stored.write_bytes(b"image")
    row = add_analysis(db, stored_name="saved.jpg")

    response = client.delete(f"/api/analyses/{row.id}")

    assert response.status_code == 200
    assert response.json() == {"deleted": row.id}
    assert not stored.exists()
    row_id = row.id
    db.expunge_all()
    assert db.get(Analysis, row_id) is None


def test_delete_analysis_not_found(client):
    assert client.delete("/api/analyses/999").status_code == 404


def test_list_birds(client, db, monkeypatch):
    db.add(BirdInfo(species="Robin", ukrainian="Вільшанка"))
    db.commit()
    fallback_worker(monkeypatch, analyses_router)

    import app.routers.birds as birds_router

    fallback_worker(monkeypatch, birds_router)

    response = client.get("/api/birds")

    assert response.status_code == 200
    assert response.json()[0]["species"] == "Robin"


def test_get_bird(client, db):
    db.add(BirdInfo(species="Robin", ukrainian="Вільшанка"))
    db.commit()

    response = client.get("/api/birds/ROBIN")

    assert response.status_code == 200
    assert response.json()["ukrainian"] == "Вільшанка"


def test_get_bird_not_found(client):
    assert client.get("/api/birds/Missing").status_code == 404


def test_stats_and_export(client, db, monkeypatch):
    import app.routers.stats as stats_router

    add_analysis(db)
    fallback_worker(monkeypatch, stats_router)

    stats_response = client.get("/api/stats")
    export_response = client.get("/api/export.csv")

    assert stats_response.status_code == 200
    assert stats_response.json()["total"] == 1
    assert export_response.status_code == 200
    assert export_response.headers["content-type"].startswith("text/csv")
    assert "bird.jpg" in export_response.text


def test_payment_config(client):
    response = client.get("/api/payments/config")

    body = response.json()

    assert response.status_code == 200
    assert body["chain_id"] == 31337
    assert body["price_wei"] == "2000000000000000"
    assert body["price_eth"] == "0.002"
    assert body["credits"] == 5


def test_wei_to_eth():
    assert payments_router.wei_to_eth(0) == "0"
    assert payments_router.wei_to_eth(10**18) == "1"
    assert payments_router.wei_to_eth(2_000_000_000_000_000) == "0.002"


def test_wallet_info(client, db):
    add_wallet(db, credits=3)
    add_transaction(db)

    response = client.get(f"/api/wallet/0x{ADDRESS[2:].upper()}")

    body = response.json()

    assert response.status_code == 200
    assert body["wallet_address"] == ADDRESS.lower()
    assert body["credits"] == 3
    assert body["last_transaction_hash"] == TX_HASH


def test_wallet_info_invalid_address(client):
    assert client.get("/api/wallet/nope").status_code == 400


def test_payment_verify_disabled(client, monkeypatch):
    monkeypatch.setattr(payments_router, "PAYMENT_ENABLED", False)

    response = client.post(
        "/api/payments/verify",
        json={"wallet_address": ADDRESS, "transaction_hash": TX_HASH},
    )

    assert response.status_code == 503


def test_payment_verify_validates_input(client, monkeypatch):
    monkeypatch.setattr(payments_router, "PAYMENT_ENABLED", True)

    response = client.post(
        "/api/payments/verify",
        json={"wallet_address": "nope", "transaction_hash": "0x123"},
    )

    assert response.status_code == 400


def test_payment_verify_already_processed(client, db, monkeypatch):
    monkeypatch.setattr(payments_router, "PAYMENT_ENABLED", True)
    add_wallet(db, credits=4)
    add_transaction(db)

    response = client.post(
        "/api/payments/verify",
        json={"wallet_address": ADDRESS, "transaction_hash": TX_HASH},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "already_processed"
    assert response.json()["credits"] == 4


def test_payment_verify_transaction_used_by_other_wallet(client, db, monkeypatch):
    monkeypatch.setattr(payments_router, "PAYMENT_ENABLED", True)
    add_transaction(db, address=OTHER_ADDRESS)

    response = client.post(
        "/api/payments/verify",
        json={"wallet_address": ADDRESS, "transaction_hash": TX_HASH},
    )

    assert response.status_code == 409


def test_payment_verify_pending(client, monkeypatch):
    monkeypatch.setattr(payments_router, "PAYMENT_ENABLED", True)
    monkeypatch.setattr(
        payments_router,
        "verify_payment",
        lambda tx, address: {
            "success": False,
            "pending": True,
            "confirmations": 0,
            "required": 2,
        },
    )

    response = client.post(
        "/api/payments/verify",
        json={"wallet_address": ADDRESS, "transaction_hash": TX_HASH},
    )

    assert response.status_code == 202
    assert response.json()["status"] == "pending"


def test_payment_verify_not_found(client, monkeypatch):
    monkeypatch.setattr(payments_router, "PAYMENT_ENABLED", True)
    monkeypatch.setattr(
        payments_router,
        "verify_payment",
        lambda tx, address: {"success": False, "not_found": True, "error": "missing"},
    )

    response = client.post(
        "/api/payments/verify",
        json={"wallet_address": ADDRESS, "transaction_hash": TX_HASH},
    )

    assert response.status_code == 404


def test_payment_verify_rpc_error(client, monkeypatch):
    monkeypatch.setattr(payments_router, "PAYMENT_ENABLED", True)
    monkeypatch.setattr(
        payments_router,
        "verify_payment",
        lambda tx, address: {"success": False, "rpc_error": True, "error": "rpc down"},
    )

    response = client.post(
        "/api/payments/verify",
        json={"wallet_address": ADDRESS, "transaction_hash": TX_HASH},
    )

    assert response.status_code == 503


def test_payment_verify_failure(client, monkeypatch):
    monkeypatch.setattr(payments_router, "PAYMENT_ENABLED", True)
    monkeypatch.setattr(
        payments_router,
        "verify_payment",
        lambda tx, address: {"success": False, "error": "Wrong amount"},
    )

    response = client.post(
        "/api/payments/verify",
        json={"wallet_address": ADDRESS, "transaction_hash": TX_HASH},
    )

    assert response.status_code == 400


def test_payment_verify_credits_wallet(client, db, monkeypatch):
    monkeypatch.setattr(payments_router, "PAYMENT_ENABLED", True)
    monkeypatch.setattr(
        payments_router,
        "verify_payment",
        lambda tx, address: {
            "success": True,
            "amount_wei": "2000000000000000",
            "block_number": 7,
        },
    )

    response = client.post(
        "/api/payments/verify",
        json={"wallet_address": ADDRESS, "transaction_hash": TX_HASH},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "credited"
    assert response.json()["credits"] == 5
    assert db.query(UsedTransaction).count() == 1


def test_payment_verify_handles_save_failure(client, monkeypatch):
    monkeypatch.setattr(payments_router, "PAYMENT_ENABLED", True)
    monkeypatch.setattr(
        payments_router,
        "verify_payment",
        lambda tx, address: {
            "success": True,
            "amount_wei": "1",
            "block_number": 1,
        },
    )
    monkeypatch.setattr(
        payments_router,
        "credit_payment",
        lambda *args, **kwargs: (None, 0),
    )

    response = client.post(
        "/api/payments/verify",
        json={"wallet_address": ADDRESS, "transaction_hash": TX_HASH},
    )

    assert response.status_code == 500


def test_payment_verify_detects_wallet_conflict(client, monkeypatch):
    monkeypatch.setattr(payments_router, "PAYMENT_ENABLED", True)
    monkeypatch.setattr(
        payments_router,
        "verify_payment",
        lambda tx, address: {
            "success": True,
            "amount_wei": "1",
            "block_number": 1,
        },
    )
    monkeypatch.setattr(
        payments_router,
        "credit_payment",
        lambda *args, **kwargs: (SimpleNamespace(wallet_address=OTHER_ADDRESS), 0),
    )

    response = client.post(
        "/api/payments/verify",
        json={"wallet_address": ADDRESS, "transaction_hash": TX_HASH},
    )

    assert response.status_code == 409


def test_payment_check_disabled(client, monkeypatch):
    monkeypatch.setattr(payments_router, "PAYMENT_ENABLED", False)

    assert client.post(f"/api/payments/check/{ADDRESS}").status_code == 503


def test_payment_check_rpc_error(client, monkeypatch):
    monkeypatch.setattr(payments_router, "PAYMENT_ENABLED", True)
    monkeypatch.setattr(
        payments_router,
        "check_payment",
        lambda address, blocks: {"success": False, "rpc_error": True, "error": "down"},
    )

    assert client.post(f"/api/payments/check/{ADDRESS}").status_code == 503


def test_payment_check_failure(client, monkeypatch):
    monkeypatch.setattr(payments_router, "PAYMENT_ENABLED", True)
    monkeypatch.setattr(
        payments_router,
        "check_payment",
        lambda address, blocks: {"success": False, "error": "failed"},
    )

    assert client.post(f"/api/payments/check/{ADDRESS}").status_code == 400


def test_payment_check_pending(client, monkeypatch):
    monkeypatch.setattr(payments_router, "PAYMENT_ENABLED", True)
    monkeypatch.setattr(
        payments_router,
        "check_payment",
        lambda address, blocks: {
            "success": True,
            "payments": [],
            "pending": [
                {
                    "transaction_hash": TX_HASH,
                    "confirmations": 0,
                    "required": 1,
                    "message": "waiting",
                }
            ],
        },
    )

    response = client.post(f"/api/payments/check/{ADDRESS}")

    assert response.status_code == 202
    assert response.json()["pending"][0]["transaction_hash"] == TX_HASH


def test_payment_check_no_new_payment(client, monkeypatch):
    monkeypatch.setattr(payments_router, "PAYMENT_ENABLED", True)
    monkeypatch.setattr(
        payments_router,
        "check_payment",
        lambda address, blocks: {"success": True, "payments": [], "pending": []},
    )

    assert client.post(f"/api/payments/check/{ADDRESS}").status_code == 404


def test_payment_check_credits_new_payments_and_skips_used(client, db, monkeypatch):
    monkeypatch.setattr(payments_router, "PAYMENT_ENABLED", True)
    used_hash = "0x" + "cc" * 32
    new_hash = "0x" + "dd" * 32
    add_transaction(db, tx_hash=used_hash)
    monkeypatch.setattr(
        payments_router,
        "check_payment",
        lambda address, blocks: {
            "success": True,
            "payments": [
                {
                    "transaction_hash": used_hash,
                    "amount_wei": "1",
                    "block_number": 1,
                },
                {
                    "transaction_hash": new_hash,
                    "amount_wei": "2000000000000000",
                    "block_number": 2,
                },
            ],
            "pending": [],
        },
    )

    response = client.post(f"/api/payments/check/{ADDRESS}")

    assert response.status_code == 200
    assert response.json()["status"] == "credited"
    assert response.json()["transactions"] == [new_hash]
    assert response.json()["credits"] == 5
