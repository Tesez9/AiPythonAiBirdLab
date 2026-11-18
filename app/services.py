import json
import re
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException

from app.ai_client import call_ai
from app.config import (
    ALLOWED_EXTENSIONS,
    MAX_FILE_SIZE,
    PAYMENT_CREDITS,
    PAYMENT_ENABLED,
    PAYMENT_PRICE_WEI,
    UPLOAD_DIR,
)
from app.models import Analysis
from app.repository import (
    find_info,
    get_analysis_data,
    get_credits,
    refund_credit,
    reserve_credit,
)
from app.serializers import analysis_to_dict, bird_info_to_dict

ADDRESS_PATTERN = re.compile(r"^0x[a-fA-F0-9]{40}$")
TRANSACTION_PATTERN = re.compile(r"^0x[a-fA-F0-9]{64}$")


def normalize_wallet_address(value):
    if not value or not ADDRESS_PATTERN.fullmatch(value.strip()):
        raise HTTPException(
            status_code=400,
            detail="Invalid wallet address",
        )

    return value.strip().lower()


def normalize_transaction_hash(value):
    if not value or not TRANSACTION_PATTERN.fullmatch(value.strip()):
        raise HTTPException(
            status_code=400,
            detail="Invalid transaction hash",
        )

    return value.strip().lower()


def payment_required_error(db, wallet_address):
    return HTTPException(
        status_code=402,
        detail={
            "message": "Payment required",
            "credits": get_credits(db, wallet_address),
            "price_wei": str(PAYMENT_PRICE_WEI),
            "package_credits": PAYMENT_CREDITS,
        },
    )


def safe_refund(db, wallet_address):
    try:
        refund_credit(db, wallet_address)
    except Exception as error:
        print("Failed to refund credit:", error, flush=True)


def get_analysis_or_404(db, analysis_id):
    analysis = get_analysis_data(db, analysis_id)

    if analysis is None:
        raise HTTPException(
            status_code=404,
            detail="Analysis not found",
        )

    return analysis


async def analyze_file(file, db, wallet_address=None):
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

    wallet = None
    reserved = False

    if PAYMENT_ENABLED:
        if not wallet_address:
            raise HTTPException(
                status_code=400,
                detail="Wallet address is required",
            )

        wallet = normalize_wallet_address(wallet_address)

        if not reserve_credit(db, wallet):
            raise payment_required_error(db, wallet)

        reserved = True

    stored_path = None

    try:
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
            stored_path = None

            raise HTTPException(
                status_code=500,
                detail="Failed to save analysis",
            )
    except Exception:
        db.rollback()

        if stored_path is not None:
            stored_path.unlink(missing_ok=True)

        if reserved:
            safe_refund(db, wallet)

        raise

    result = analysis_to_dict(row, full=True)

    if reserved:
        result["credits_left"] = get_credits(db, wallet)

    return result
