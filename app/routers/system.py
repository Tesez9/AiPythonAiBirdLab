import httpx
from fastapi import APIRouter
from sqlalchemy import text

from app.config import AI_SERVER_URL
from app.database import engine

router = APIRouter(tags=["system"])


@router.get("/")
def root():
    return {
        "service": "bird-central-server",
        "docs": "/docs",
        "ai_server": AI_SERVER_URL,
    }


@router.get("/health")
async def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        database_status = "ok"
    except Exception as error:
        database_status = f"error: {error}"

    ai_status = "ok"

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(f"{AI_SERVER_URL}/health")

        if response.status_code != 200:
            ai_status = f"http {response.status_code}"
        elif response.json().get("status") != "ok":
            ai_status = "not ready"
    except httpx.RequestError as error:
        ai_status = f"unavailable: {error}"

    status = (
        "ok"
        if database_status == "ok" and ai_status == "ok"
        else "degraded"
    )

    return {
        "status": status,
        "database": database_status,
        "ai_server": ai_status,
        "ai_url": AI_SERVER_URL,
    }
