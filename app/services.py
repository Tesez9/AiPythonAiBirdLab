import json
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException

from app.ai_client import call_ai
from app.config import ALLOWED_EXTENSIONS, MAX_FILE_SIZE, UPLOAD_DIR
from app.models import Analysis
from app.repository import find_info, get_analysis_data
from app.serializers import analysis_to_dict, bird_info_to_dict


def get_analysis_or_404(db, analysis_id):
    analysis = get_analysis_data(db, analysis_id)

    if analysis is None:
        raise HTTPException(
            status_code=404,
            detail="Analysis not found",
        )

    return analysis


async def analyze_file(file, db):
    filename = file.filename or "image.jpg"
    suffix = Path(filename).suffix.lower()

    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only JPG, JPEG and PNG are supported",
        )

    data = await file.read()

    if not data:
        raise HTTPException(
            status_code=400,
            detail="Empty file",
        )

    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File is too large (max 10 MB)",
        )

    prediction = await call_ai(
        filename,
        file.content_type,
        data,
    )
    species = prediction.get("predicted_species")

    if not species:
        raise HTTPException(
            status_code=502,
            detail="AI server returned no species",
        )

    confidence = float(prediction.get("confidence", 0))
    top3 = prediction.get("top3", [])
    info = find_info(db, species)
    description = (
        info.description
        if info and info.description
        else "Інформація про вид відсутня."
    )
    source = info.source if info and info.source else ""
    extra_info = bird_info_to_dict(info)
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    stored_path = UPLOAD_DIR / stored_name

    try:
        stored_path.write_bytes(data)
    except OSError as error:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save image: {error}",
        )

    row = Analysis(
        image_name=filename,
        stored_name=stored_name,
        predicted_species=species,
        confidence=confidence,
        top3=json.dumps(top3, ensure_ascii=False),
        analysis_date=datetime.utcnow(),
        description=description,
        source=source,
        extra_info=json.dumps(extra_info, ensure_ascii=False)
        if extra_info
        else "",
    )

    try:
        db.add(row)
        db.commit()
        db.refresh(row)
    except Exception:
        db.rollback()
        stored_path.unlink(missing_ok=True)

        raise HTTPException(
            status_code=500,
            detail="Failed to save analysis",
        )

    return analysis_to_dict(row, full=True)
