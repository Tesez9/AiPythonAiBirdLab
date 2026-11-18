from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import INPUT_DIR, UPLOAD_DIR
from app.database import Base, SessionLocal, engine, ensure_schema
from app.routers import analyses, birds, payments, stats, system
from app.seed import seed_bird_info


@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(bind=engine)
    ensure_schema()

    with SessionLocal() as db:
        seed_bird_info(db)

    yield


app = FastAPI(
    title="Bird Central Server",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(
    "/uploads",
    StaticFiles(directory=str(UPLOAD_DIR)),
    name="uploads",
)

if INPUT_DIR.is_dir():
    app.mount(
        "/input",
        StaticFiles(directory=str(INPUT_DIR)),
        name="input",
    )

app.include_router(system.router)
app.include_router(analyses.router)
app.include_router(payments.router)
app.include_router(stats.router)
app.include_router(birds.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
