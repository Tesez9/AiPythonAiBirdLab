import io
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from starlette.datastructures import Headers, UploadFile

import app.services as services
from app.models import Analysis, BirdInfo, WalletCredit


def upload(name="bird.jpg", data=b"image-bytes", content_type="image/jpeg"):
    return UploadFile(
        file=io.BytesIO(data),
        filename=name,
        headers=Headers({"content-type": content_type}),
    )


def add_wallet(db, address, credits):
    db.add(WalletCredit(wallet_address=address.lower(), credits=credits))
    db.commit()


def test_normalize_wallet_address():
    assert (
        services.normalize_wallet_address(
            " 0xAbCdEf0000000000000000000000000000000001 "
        )
        == "0xabcdef0000000000000000000000000000000001"
    )

    with pytest.raises(HTTPException) as error:
        services.normalize_wallet_address("nope")

    assert error.value.status_code == 400
    assert error.value.detail == "Invalid wallet address"

    with pytest.raises(HTTPException):
        services.normalize_wallet_address(None)


def test_normalize_transaction_hash():
    value = "0x" + "AB" * 32

    assert services.normalize_transaction_hash(value) == value.lower()

    with pytest.raises(HTTPException) as error:
        services.normalize_transaction_hash("0x123")

    assert error.value.status_code == 400
    assert error.value.detail == "Invalid transaction hash"

    with pytest.raises(HTTPException):
        services.normalize_transaction_hash(None)


def test_payment_required_error_contains_package_details(db):
    add_wallet(db, "0xabc", 2)

    error = services.payment_required_error(db, "0xabc")

    assert error.status_code == 402
    assert error.detail["credits"] == 2
    assert error.detail["price_wei"] == "2000000000000000"
    assert error.detail["package_credits"] == 5


def test_safe_refund_swallows_errors(monkeypatch):
    def broken_refund(db, wallet):
        raise RuntimeError("database down")

    monkeypatch.setattr(services, "refund_credit", broken_refund)

    services.safe_refund(None, "0xabc")


def test_get_analysis_or_404(db):
    row = Analysis(
        image_name="bird.jpg",
        predicted_species="Robin",
        confidence=0.8,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    assert services.get_analysis_or_404(db, row.id)["predicted_species"] == "Robin"

    with pytest.raises(HTTPException) as error:
        services.get_analysis_or_404(db, 999)

    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_analyze_file_rejects_bad_extension(db):
    with pytest.raises(HTTPException) as error:
        await services.analyze_file(upload("bird.gif"), db)

    assert error.value.status_code == 400
    assert "JPG" in error.value.detail


@pytest.mark.asyncio
async def test_analyze_file_rejects_empty_file(db):
    with pytest.raises(HTTPException) as error:
        await services.analyze_file(upload(data=b""), db)

    assert error.value.status_code == 400
    assert error.value.detail == "Empty file"


@pytest.mark.asyncio
async def test_analyze_file_rejects_large_file(db, monkeypatch):
    monkeypatch.setattr(services, "MAX_FILE_SIZE", 4)

    with pytest.raises(HTTPException) as error:
        await services.analyze_file(upload(data=b"12345"), db)

    assert error.value.status_code == 413


@pytest.mark.asyncio
async def test_analyze_file_requires_wallet_when_payments_enabled(db, monkeypatch):
    monkeypatch.setattr(services, "PAYMENT_ENABLED", True)

    with pytest.raises(HTTPException) as error:
        await services.analyze_file(upload(), db)

    assert error.value.status_code == 400
    assert error.value.detail == "Wallet address is required"


@pytest.mark.asyncio
async def test_analyze_file_requires_credits_when_payments_enabled(db, monkeypatch):
    monkeypatch.setattr(services, "PAYMENT_ENABLED", True)

    with pytest.raises(HTTPException) as error:
        await services.analyze_file(
            upload(),
            db,
            "0xAbCdEf0000000000000000000000000000000001",
        )

    assert error.value.status_code == 402


@pytest.mark.asyncio
async def test_analyze_file_success_free_mode(db, upload_dir, monkeypatch):
    monkeypatch.setattr(services, "PAYMENT_ENABLED", False)
    monkeypatch.setattr(
        services,
        "call_ai",
        AsyncMock(
            return_value={
                "predicted_species": "Robin",
                "confidence": 0.91,
                "top3": [{"species": "Robin", "confidence": 0.91}],
            }
        ),
    )
    db.add(
        BirdInfo(
            species="Robin",
            description="Опис вільшанки",
            source="https://example.com/robin",
        )
    )
    db.commit()

    result = await services.analyze_file(upload(), db)

    assert result["predicted_species"] == "Robin"
    assert result["confidence"] == 0.91
    assert result["description"] == "Опис вільшанки"
    assert result["top3"] == [{"species": "Robin", "confidence": 0.91}]
    assert "credits_left" not in result
    assert len(list(upload_dir.iterdir())) == 1
    assert db.query(Analysis).count() == 1


@pytest.mark.asyncio
async def test_analyze_file_success_paid_mode(db, upload_dir, monkeypatch):
    address = "0xAbCdEf0000000000000000000000000000000001"
    monkeypatch.setattr(services, "PAYMENT_ENABLED", True)
    monkeypatch.setattr(
        services,
        "call_ai",
        AsyncMock(
            return_value={
                "predicted_species": "Unknown",
                "confidence": 0.2,
            }
        ),
    )
    add_wallet(db, address, 2)

    result = await services.analyze_file(upload(), db, address)

    assert result["predicted_species"] == "Unknown"
    assert result["description"] == "Інформація про вид відсутня."
    assert result["info"] is None
    assert result["credits_left"] == 1


@pytest.mark.asyncio
async def test_analyze_file_refunds_when_ai_returns_no_species(db, monkeypatch):
    address = "0xAbCdEf0000000000000000000000000000000001"
    monkeypatch.setattr(services, "PAYMENT_ENABLED", True)
    monkeypatch.setattr(
        services,
        "call_ai",
        AsyncMock(return_value={"confidence": 0.5}),
    )
    add_wallet(db, address, 1)

    with pytest.raises(HTTPException) as error:
        await services.analyze_file(upload(), db, address)

    assert error.value.status_code == 502
    assert services.get_credits(db, address) == 1


@pytest.mark.asyncio
async def test_analyze_file_refunds_when_ai_raises(db, monkeypatch):
    address = "0xAbCdEf0000000000000000000000000000000001"
    monkeypatch.setattr(services, "PAYMENT_ENABLED", True)
    monkeypatch.setattr(
        services,
        "call_ai",
        AsyncMock(side_effect=RuntimeError("AI down")),
    )
    add_wallet(db, address, 1)

    with pytest.raises(RuntimeError):
        await services.analyze_file(upload(), db, address)

    assert services.get_credits(db, address) == 1


@pytest.mark.asyncio
async def test_analyze_file_handles_write_failure(db, monkeypatch, tmp_path):
    address = "0xAbCdEf0000000000000000000000000000000001"
    blocked = tmp_path / "blocked"
    blocked.write_text("not a directory")
    monkeypatch.setattr(services, "PAYMENT_ENABLED", True)
    monkeypatch.setattr(services, "UPLOAD_DIR", blocked)
    monkeypatch.setattr(
        services,
        "call_ai",
        AsyncMock(return_value={"predicted_species": "Robin", "confidence": 0.8}),
    )
    add_wallet(db, address, 1)

    with pytest.raises(HTTPException) as error:
        await services.analyze_file(upload(), db, address)

    assert error.value.status_code == 500
    assert "Failed to save image" in error.value.detail
    assert services.get_credits(db, address) == 1


@pytest.mark.asyncio
async def test_analyze_file_handles_database_commit_failure(
    db, upload_dir, monkeypatch
):
    address = "0xAbCdEf0000000000000000000000000000000001"
    monkeypatch.setattr(services, "PAYMENT_ENABLED", True)
    monkeypatch.setattr(
        services,
        "call_ai",
        AsyncMock(return_value={"predicted_species": "Robin", "confidence": 0.8}),
    )
    add_wallet(db, address, 1)
    original_commit = db.commit
    calls = {"count": 0}

    def commit():
        calls["count"] += 1

        if calls["count"] >= 2:
            raise RuntimeError("commit failed")

        original_commit()

    monkeypatch.setattr(db, "commit", commit)

    with pytest.raises(HTTPException) as error:
        await services.analyze_file(upload(), db, address)

    assert error.value.status_code == 500
    assert error.value.detail == "Failed to save analysis"
    assert list(upload_dir.iterdir()) == []
