import json

from app.config import BIRD_INFO_FILE
from app.models import BirdInfo


def seed_bird_info(db):
    if not BIRD_INFO_FILE.is_file():
        print("Bird info seed not found:", BIRD_INFO_FILE)
        return

    try:
        with open(BIRD_INFO_FILE, encoding="utf-8") as file:
            data = json.load(file)
    except (OSError, json.JSONDecodeError) as error:
        print("Bird info seed error:", error)
        return

    created = 0

    for species, info in data.items():
        if db.get(BirdInfo, species) is not None:
            continue

        db.add(
            BirdInfo(
                species=species,
                ukrainian=info.get("ukrainian", ""),
                scientific=info.get("scientific", ""),
                family=info.get("family", ""),
                habitat=info.get("habitat", ""),
                range_text=info.get("range", ""),
                diet=info.get("diet", ""),
                size=info.get("size", ""),
                facts=info.get("facts", ""),
                status=info.get("status", ""),
                description=info.get("description", ""),
                source=info.get("source", ""),
            )
        )
        created += 1

    db.commit()
    print("Bird info seeded:", created, "new rows")
