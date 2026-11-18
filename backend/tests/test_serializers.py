from datetime import datetime

import pytest

import app.serializers as serializers
from app.models import Analysis, BirdInfo


def test_parse_json_returns_default_for_empty_or_broken_values():
    assert serializers.parse_json("", []) == []
    assert serializers.parse_json(None, None) is None
    assert serializers.parse_json("{broken", []) == []
    assert serializers.parse_json('{"a": 1}', {}) == {"a": 1}


def test_bird_info_to_dict_handles_none_and_model():
    assert serializers.bird_info_to_dict(None) is None

    info = BirdInfo(
        species="Robin",
        ukrainian="Вільшанка",
        scientific="Erithacus rubecula",
        family="Muscicapidae",
        habitat="Ліси",
        range_text="Європа",
        diet="Комахи",
        size="12 см",
        facts="Співає",
        status="LC",
        description="Опис",
        source="https://example.com",
    )

    assert serializers.bird_info_to_dict(info) == {
        "species": "Robin",
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
    }


def test_analysis_to_dict_uses_stored_name(monkeypatch, tmp_path):
    monkeypatch.setattr(serializers, "INPUT_DIR", tmp_path)
    row = Analysis(
        id=1,
        image_name="photo.jpg",
        stored_name="saved.jpg",
        predicted_species="Robin",
        confidence=0.75,
        top3='[{"species": "Robin", "confidence": 0.75}]',
        analysis_date=datetime(2026, 1, 2, 3, 4, 5),
        description="desc",
        source="src",
        extra_info='{"species": "Robin"}',
    )

    data = serializers.analysis_to_dict(row, full=True)

    assert data["image_url"] == "/uploads/saved.jpg"
    assert data["confidence"] == 0.75
    assert data["low_confidence"] is False
    assert data["analysis_date"] == "2026-01-02T03:04:05"
    assert data["top3"] == [{"species": "Robin", "confidence": 0.75}]
    assert data["info"] == {"species": "Robin"}


def test_analysis_to_dict_falls_back_to_input_folder(monkeypatch, tmp_path):
    monkeypatch.setattr(serializers, "INPUT_DIR", tmp_path)
    (tmp_path / "legacy.jpg").write_bytes(b"image")
    row = Analysis(
        id=2,
        image_name="legacy.jpg",
        predicted_species="Sparrow",
        confidence=0.4,
        analysis_date=None,
        description=None,
        source=None,
        extra_info="not-json",
    )

    data = serializers.analysis_to_dict(row, full=True)

    assert data["image_url"] == "/input/legacy.jpg"
    assert data["low_confidence"] is True
    assert data["analysis_date"] is None
    assert data["top3"] == []
    assert data["info"] is None


def test_analysis_to_dict_without_image_and_without_full():
    row = Analysis(
        id=3,
        image_name="missing.jpg",
        predicted_species="Crow",
        confidence=0.9,
        analysis_date=datetime(2026, 5, 6),
    )

    data = serializers.analysis_to_dict(row)

    assert data["image_url"] is None
    assert "top3" not in data
    assert "info" not in data
