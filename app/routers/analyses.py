from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)

from app.config import PAYMENT_ENABLED, UPLOAD_DIR
from app.database import get_db
from app.models import Analysis
from app.rabbit_client import call_worker
from app.repository import get_analyses_data, get_credits
from app.services import analyze_file, get_analysis_or_404

router = APIRouter(prefix="/api/analyses", tags=["analyses"])


@router.post("", status_code=201)
async def create_analysis(
    file: UploadFile = File(...),
    wallet_address: str | None = Form(None),
    db=Depends(get_db),
):
    return await analyze_file(file, db, wallet_address)


@router.post("/batch", status_code=201)
async def create_analyses(
    files: list[UploadFile] = File(...),
    wallet_address: str | None = Form(None),
    db=Depends(get_db),
):
    items = []
    errors = []

    for file in files:
        try:
            items.append(await analyze_file(file, db, wallet_address))
        except HTTPException as error:
            errors.append(
                {
                    "filename": file.filename,
                    "detail": error.detail,
                }
            )

    response = {
        "total": len(items),
        "items": items,
        "errors": errors,
    }

    if PAYMENT_ENABLED and wallet_address:
        response["credits_left"] = get_credits(db, wallet_address)

    return response


@router.get("")
async def list_analyses(
    query: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db=Depends(get_db),
):
    return await call_worker(
        {
            "action": "history",
            "query": query,
            "skip": skip,
            "limit": limit,
        },
        lambda: get_analyses_data(db, query, skip, limit),
    )


@router.get("/{analysis_id}")
async def get_analysis(analysis_id: int, db=Depends(get_db)):
    return await call_worker(
        {
            "action": "analysis",
            "id": analysis_id,
        },
        lambda: get_analysis_or_404(db, analysis_id),
    )


@router.delete("/{analysis_id}")
def delete_analysis(analysis_id: int, db=Depends(get_db)):
    row = db.get(Analysis, analysis_id)

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Analysis not found",
        )

    stored_name = row.stored_name
    db.delete(row)
    db.commit()

    if stored_name:
        (UPLOAD_DIR / stored_name).unlink(missing_ok=True)

    return {"deleted": analysis_id}
