import json

import app.seed as seed
from app.models import BirdInfo


def test_seed_skips_missing_file(db, monkeypatch, tmp_path):
    monkeypatch.setattr(seed, "BIRD_INFO_FILE", tmp_path / "missing.json")

    seed.seed_bird_info(db)

    assert db.query(BirdInfo).count() == 0


def test_seed_skips_invalid_json(db, monkeypatch, tmp_path):
    path = tmp_path / "bird_info.json"
    path.write_text("{broken", encoding="utf-8")
    monkeypatch.setattr(seed, "BIRD_INFO_FILE", path)

    seed.seed_bird_info(db)

    assert db.query(BirdInfo).count() == 0


def test_seed_skips_unreadable_path(db, monkeypatch, tmp_path):
    monkeypatch.setattr(seed, "BIRD_INFO_FILE", tmp_path)

    seed.seed_bird_info(db)

    assert db.query(BirdInfo).count() == 0


def test_seed_creates_rows_and_skips_existing(db, monkeypatch, tmp_path):
    path = tmp_path / "bird_info.json"
    path.write_text(
        json.dumps(
            {
                "Robin": {
                    "ukrainian": "Вільшанка",
                    "scientific": "Erithacus rubecula",
                    "family": "Muscicapidae",
                    "habitat": "Ліси",
                    "range": "Європа",
                    "diet": "Комахи",
                    "size": "12 см",
                    "facts": "Співає",
                    "status": "LC",
                    "description": "Опис",
                    "source": "https://example.com",
                },
                "Sparrow": {},
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(seed, "BIRD_INFO_FILE", path)

    seed.seed_bird_info(db)

    robin = db.get(BirdInfo, "Robin")
    sparrow = db.get(BirdInfo, "Sparrow")

    assert robin.ukrainian == "Вільшанка"
    assert robin.range_text == "Європа"
    assert sparrow.ukrainian == ""
    assert db.query(BirdInfo).count() == 2

    seed.seed_bird_info(db)

    assert db.query(BirdInfo).count() == 2
