from datetime import datetime, timedelta

from app.models import Analysis, BirdInfo, UsedTransaction, WalletCredit
from app.repository import (
    build_csv_content,
    credit_payment,
    find_info,
    get_analyses_data,
    get_analysis_data,
    get_birds_data,
    get_credits,
    get_last_transaction,
    get_or_create_wallet,
    get_stats_data,
    get_transaction,
    get_wallet,
    normalize_address,
    refund_credit,
    reserve_credit,
)

ADDRESS = "0xAbCdEf0000000000000000000000000000000001"
OTHER_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678"
TX_HASH = "0x" + "ab" * 32


def make_analysis(db, **overrides):
    values = {
        "image_name": "bird.jpg",
        "predicted_species": "Robin",
        "confidence": 0.8,
        "analysis_date": datetime(2026, 1, 1, 12, 0, 0),
        "description": "A small bird",
        "source": "https://example.com",
        "top3": "[]",
    }
    values.update(overrides)
    row = Analysis(**values)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def make_bird(db, species="Robin", **overrides):
    values = {
        "species": species,
        "ukrainian": "Вільшанка",
        "scientific": "Erithacus rubecula",
        "description": "Опис",
        "source": "https://example.com",
    }
    values.update(overrides)
    row = BirdInfo(**values)
    db.add(row)
    db.commit()
    return row


def test_find_info_is_case_insensitive_and_handles_empty(db):
    make_bird(db, "Robin")

    assert find_info(db, " robin ").species == "Robin"
    assert find_info(db, "ROBIN").species == "Robin"
    assert find_info(db, "") is None
    assert find_info(db, None) is None
    assert find_info(db, "Missing") is None


def test_get_analyses_data_filters_and_paginates(db):
    first = make_analysis(db, predicted_species="Robin", confidence=0.9)
    second = make_analysis(
        db,
        image_name="sparrow.png",
        predicted_species="Sparrow",
        confidence=0.5,
        description="Urban bird",
    )
    make_analysis(db, predicted_species="Crow", confidence=0.7)

    page = get_analyses_data(db)
    assert page["total"] == 3
    assert [item["id"] for item in page["items"]] == [3, second.id, first.id]

    filtered = get_analyses_data(db, "sparrow")
    assert filtered["total"] == 1
    assert filtered["items"][0]["predicted_species"] == "Sparrow"

    by_description = get_analyses_data(db, "urban")
    assert by_description["total"] == 1

    paged = get_analyses_data(db, skip=1, limit=1)
    assert paged["total"] == 3
    assert len(paged["items"]) == 1


def test_get_analysis_data_returns_full_or_none(db):
    row = make_analysis(db, top3='[{"species": "Robin", "confidence": 0.8}]')

    assert get_analysis_data(db, row.id)["top3"] == [
        {"species": "Robin", "confidence": 0.8}
    ]
    assert get_analysis_data(db, 9999) is None


def test_get_stats_data_for_empty_database(db):
    stats = get_stats_data(db)

    assert stats == {
        "total": 0,
        "unique_species": 0,
        "average_confidence": 0.0,
        "highest": None,
        "lowest": None,
        "top_species": [],
    }


def test_get_stats_data_aggregates_rows(db):
    make_analysis(db, predicted_species="Robin", confidence=0.9)
    make_analysis(db, predicted_species="Robin", confidence=0.7)
    make_analysis(db, predicted_species="Sparrow", confidence=0.5)

    stats = get_stats_data(db)

    assert stats["total"] == 3
    assert stats["unique_species"] == 2
    assert stats["average_confidence"] == 0.7
    assert stats["highest"]["confidence"] == 0.9
    assert stats["lowest"]["confidence"] == 0.5
    assert stats["top_species"][0] == {"species": "Robin", "count": 2}
    assert stats["top_species"][1] == {"species": "Sparrow", "count": 1}


def test_build_csv_content_orders_rows_and_formats_dates(db):
    make_analysis(db, image_name="second.jpg")
    make_analysis(
        db,
        image_name="first.jpg",
        predicted_species="Sparrow",
        confidence=0.5,
        analysis_date=datetime(2026, 2, 3, 4, 5, 6),
        description="with, comma",
    )

    csv_content = build_csv_content(db)
    lines = csv_content.strip().splitlines()

    assert lines[0] == "image_name,predicted_species,confidence,analysis_date,description"
    assert lines[1].startswith("second.jpg,Robin,0.8000,2026-")
    assert lines[2].startswith("first.jpg,Sparrow,0.5000,2026-02-03T04:05:06")
    assert '"with, comma"' in lines[2]


def test_get_birds_data_sorts_by_species(db):
    make_bird(db, "Zebra Finch")
    make_bird(db, "Albatross")

    birds = get_birds_data(db)

    assert [bird["species"] for bird in birds] == ["Albatross", "Zebra Finch"]


def test_normalize_address():
    assert normalize_address(None) == ""
    assert normalize_address(" 0xABC ") == "0xabc"


def test_wallet_helpers(db):
    assert get_wallet(db, ADDRESS) is None
    assert get_credits(db, ADDRESS) == 0

    wallet = get_or_create_wallet(db, ADDRESS)
    assert wallet.wallet_address == ADDRESS.lower()
    assert wallet.credits == 0
    assert get_or_create_wallet(db, ADDRESS) is wallet

    assert reserve_credit(db, ADDRESS) is False

    wallet.credits = 2
    db.commit()

    assert reserve_credit(db, ADDRESS) is True
    db.refresh(wallet)
    assert wallet.credits == 1

    assert refund_credit(db, ADDRESS) == 2
    assert refund_credit(db, OTHER_ADDRESS) == 1


def test_transaction_helpers(db):
    assert get_transaction(db, None) is None
    assert get_last_transaction(db, ADDRESS) is None

    now = datetime(2026, 1, 1)
    db.add(
        UsedTransaction(
            transaction_hash=TX_HASH,
            wallet_address=ADDRESS.lower(),
            credits=5,
            amount_wei="100",
            block_number=1,
            chain_id=31337,
            created_at=now,
        )
    )
    db.add(
        UsedTransaction(
            transaction_hash="0x" + "cd" * 32,
            wallet_address=ADDRESS.lower(),
            credits=5,
            amount_wei="100",
            block_number=2,
            chain_id=31337,
            created_at=now + timedelta(hours=1),
        )
    )
    db.commit()

    assert get_transaction(db, " " + TX_HASH.upper() + " ").transaction_hash == TX_HASH
    assert get_last_transaction(db, ADDRESS).block_number == 2


def test_credit_payment_creates_wallet_and_is_idempotent(db):
    transaction, credits = credit_payment(
        db,
        TX_HASH.upper(),
        ADDRESS.upper(),
        5,
        "2000000000000000",
        10,
        31337,
    )

    assert transaction.transaction_hash == TX_HASH
    assert transaction.wallet_address == ADDRESS.lower()
    assert credits == 5
    assert get_credits(db, ADDRESS) == 5

    again, again_credits = credit_payment(
        db,
        TX_HASH,
        ADDRESS,
        5,
        "2000000000000000",
        10,
        31337,
    )

    assert again.transaction_hash == TX_HASH
    assert again_credits == 5
    assert db.query(UsedTransaction).count() == 1


def test_credit_payment_existing_transaction_for_other_wallet(db):
    credit_payment(db, TX_HASH, ADDRESS, 5, "1", 1, 31337)

    transaction, credits = credit_payment(db, TX_HASH, OTHER_ADDRESS, 5, "1", 1, 31337)

    assert transaction.wallet_address == ADDRESS.lower()
    assert credits == 0
    assert get_credits(db, OTHER_ADDRESS) == 0
