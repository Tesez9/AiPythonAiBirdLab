from fastapi import APIRouter, Depends, HTTPException

from app.database import get_db
from app.rabbit_client import call_worker
from app.repository import find_info, get_birds_data
from app.serializers import bird_info_to_dict

router = APIRouter(prefix="/api/birds", tags=["birds"])


@router.get("")
async def list_birds(db=Depends(get_db)):
    return await call_worker(
        {"action": "birds"},
        lambda: get_birds_data(db),
    )


@router.get("/{species}")
def get_bird(species: str, db=Depends(get_db)):
    info = find_info(db, species)

    if info is None:
        raise HTTPException(
            status_code=404,
            detail="Bird info not found",
        )

    return bird_info_to_dict(info)
