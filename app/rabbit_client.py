from fastapi import HTTPException

from rabbit import rabbit_request


async def call_worker(data, fallback):
    try:
        result = await rabbit_request(data)
    except Exception as error:
        print(
            "RabbitMQ unavailable, using database fallback:",
            error,
            flush=True,
        )
        return fallback()

    if isinstance(result, dict) and "__error__" in result:
        raise HTTPException(
            status_code=int(result.get("__status__", 500)),
            detail=result["__error__"],
        )

    return result
