import json

from app.config import CONFIDENCE_LIMIT, INPUT_DIR


def parse_json(value, default):
    if not value:
        return default

    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def bird_info_to_dict(info):
    if info is None:
        return None

    return {
        "species": info.species,
        "ukrainian": info.ukrainian,
        "scientific": info.scientific,
        "family": info.family,
        "habitat": info.habitat,
        "range": info.range_text,
        "diet": info.diet,
        "size": info.size,
        "facts": info.facts,
        "status": info.status,
        "description": info.description,
        "source": info.source,
    }


def analysis_to_dict(row, full=False):
    image_url = None

    if row.stored_name:
        image_url = f"/uploads/{row.stored_name}"
    elif row.image_name and (INPUT_DIR / row.image_name).is_file():
        image_url = f"/input/{row.image_name}"

    data = {
        "id": row.id,
        "image_name": row.image_name,
        "image_url": image_url,
        "predicted_species": row.predicted_species,
        "confidence": round(float(row.confidence), 4),
        "low_confidence": float(row.confidence) < CONFIDENCE_LIMIT,
        "analysis_date": row.analysis_date.isoformat()
        if row.analysis_date
        else None,
        "description": row.description,
        "source": row.source,
    }

    if full:
        data["top3"] = parse_json(row.top3, [])
        data["info"] = parse_json(row.extra_info, None)

    return data
