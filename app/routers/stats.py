from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.database import get_db
from app.rabbit_client import call_worker
from app.repository import build_csv_content, get_stats_data

router = APIRouter(prefix="/api", tags=["stats"])


@router.get("/stats")
async def stats(db=Depends(get_db)):
    return await call_worker(
        {"action": "stats"},
        lambda: get_stats_data(db),
    )


@router.get("/export.csv")
async def export_csv(db=Depends(get_db)):
    result = await call_worker(
        {"action": "export"},
        lambda: {"csv": build_csv_content(db)},
    )
    content = "\ufeff" + result["csv"]

    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="bird_analysis.csv"'
        },
    )
