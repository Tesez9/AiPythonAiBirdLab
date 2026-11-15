import httpx
from fastapi import HTTPException

from app.config import AI_SERVER_URL


async def call_ai(filename, content_type, data):
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{AI_SERVER_URL}/predict",
                files={
                    "file": (
                        filename,
                        data,
                        content_type or "application/octet-stream",
                    )
                },
            )
    except httpx.RequestError as error:
        raise HTTPException(
            status_code=502,
            detail=f"AI server unavailable: {error}",
        )

    if response.status_code != 200:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text

        raise HTTPException(
            status_code=502,
            detail=f"AI server error: {detail}",
        )

    return response.json()
