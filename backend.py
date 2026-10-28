import csv
import io
import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import (
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    create_engine,
    distinct,
    func,
    inspect,
    or_,
    text,
)
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

DB_PATH = BASE_DIR / "bird_lab.db"

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{DB_PATH.as_posix()}",
)
AI_SERVER_URL = os.getenv("AI_SERVER_URL", "http://127.0.0.1:8001").rstrip("/")

upload_value = os.getenv("UPLOAD_DIR", "uploads")
UPLOAD_DIR = Path(upload_value)

if not UPLOAD_DIR.is_absolute():
    UPLOAD_DIR = BASE_DIR / UPLOAD_DIR

BIRD_INFO_FILE = Path(
    os.getenv("BIRD_INFO_FILE", str(BASE_DIR / "bird_info.json"))
)
INPUT_DIR = BASE_DIR / "input"

MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}
CONFIDENCE_LIMIT = 0.6

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

connect_args = {}

if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)
Base = declarative_base()


class BirdInfo(Base):
    __tablename__ = "bird_info"

    species = Column(String(100), primary_key=True)
    ukrainian = Column(String(100))
    scientific = Column(String(150))
    family = Column(String(100))
    habitat = Column(Text)
    range_text = Column("range", Text)
    diet = Column(Text)
    size = Column(Text)
    facts = Column(Text)
    status = Column(String(100))
    description = Column(Text)
    source = Column(String(255))


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    image_name = Column(String(255), nullable=False)
    stored_name = Column(String(255))
    predicted_species = Column(String(100), nullable=False)
    confidence = Column(Float, nullable=False)
    top3 = Column(Text)
    analysis_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    description = Column(Text)
    source = Column(String(255))
    extra_info = Column(Text)


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


def find_info(db, species):
    if not species:
        return None

    return (
        db.query(BirdInfo)
        .filter(func.lower(BirdInfo.species) == species.strip().lower())
        .first()
    )


def bird_info_to_dict(info):
    if info is None:
        return None

    return {
        "species": info.species,
        "ukrainian": info.ukrainian,
        "scientific": info.scientific,
        "family": info.family,
        "habitat": info.habitat,
        "range": info.range_text,
        "diet": info.diet,
        "size": info.size,
        "facts": info.facts,
        "status": info.status,
        "description": info.description,
        "source": info.source,
    }


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


def parse_json(value, default):
    if not value:
        return default

    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def analysis_to_dict(row, full=False):
    image_url = None

    if row.stored_name:
        image_url = f"/uploads/{row.stored_name}"
    elif row.image_name and (INPUT_DIR / row.image_name).is_file():
        image_url = f"/input/{row.image_name}"

    data = {
        "id": row.id,
        "image_name": row.image_name,
        "image_url": image_url,
        "predicted_species": row.predicted_species,
        "confidence": round(float(row.confidence), 4),
        "low_confidence": float(row.confidence) < CONFIDENCE_LIMIT,
        "analysis_date": row.analysis_date.isoformat()
        if row.analysis_date
        else None,
        "description": row.description,
        "source": row.source,
    }

    if full:
        data["top3"] = parse_json(row.top3, [])
        data["info"] = parse_json(row.extra_info, None)

    return data


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


def ensure_schema():
    inspector = inspect(engine)

    if "analyses" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("analyses")}

    if "stored_name" in columns:
        return

    with engine.begin() as connection:
        connection.execute(
            text("ALTER TABLE analyses ADD COLUMN stored_name VARCHAR(255)")
        )

    print("Added analyses.stored_name")


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


@app.get("/")
def root():
    return {
        "service": "bird-central-server",
        "docs": "/docs",
        "ai_server": AI_SERVER_URL,
    }


@app.get("/health")
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


@app.post("/api/analyses", status_code=201)
async def create_analysis(
    file: UploadFile = File(...),
    db=Depends(get_db),
):
    return await analyze_file(file, db)


@app.post("/api/analyses/batch", status_code=201)
async def create_analyses(
    files: list[UploadFile] = File(...),
    db=Depends(get_db),
):
    items = []
    errors = []

    for file in files:
        try:
            items.append(await analyze_file(file, db))
        except HTTPException as error:
            errors.append(
                {
                    "filename": file.filename,
                    "detail": error.detail,
                }
            )

    return {
        "total": len(items),
        "items": items,
        "errors": errors,
    }


@app.get("/api/analyses")
def list_analyses(
    query: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db=Depends(get_db),
):
    rows_query = db.query(Analysis)

    if query:
        needle = f"%{query.strip()}%"
        rows_query = rows_query.filter(
            or_(
                Analysis.image_name.ilike(needle),
                Analysis.predicted_species.ilike(needle),
                Analysis.description.ilike(needle),
            )
        )

    total = rows_query.count()
    rows = (
        rows_query.order_by(Analysis.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "items": [analysis_to_dict(row) for row in rows],
    }


@app.get("/api/analyses/{analysis_id}")
def get_analysis(analysis_id: int, db=Depends(get_db)):
    row = db.get(Analysis, analysis_id)

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Analysis not found",
        )

    return analysis_to_dict(row, full=True)


@app.delete("/api/analyses/{analysis_id}")
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


@app.get("/api/stats")
def stats(db=Depends(get_db)):
    total = db.query(func.count(Analysis.id)).scalar() or 0
    unique_species = (
        db.query(func.count(distinct(Analysis.predicted_species))).scalar()
        or 0
    )
    average = db.query(func.avg(Analysis.confidence)).scalar() or 0
    highest = (
        db.query(Analysis)
        .order_by(Analysis.confidence.desc(), Analysis.id.asc())
        .first()
    )
    lowest = (
        db.query(Analysis)
        .order_by(Analysis.confidence.asc(), Analysis.id.asc())
        .first()
    )
    top = (
        db.query(
            Analysis.predicted_species,
            func.count(Analysis.id).label("count"),
        )
        .group_by(Analysis.predicted_species)
        .order_by(
            func.count(Analysis.id).desc(),
            Analysis.predicted_species.asc(),
        )
        .limit(5)
        .all()
    )

    return {
        "total": total,
        "unique_species": unique_species,
        "average_confidence": round(float(average), 4),
        "highest": analysis_to_dict(highest) if highest else None,
        "lowest": analysis_to_dict(lowest) if lowest else None,
        "top_species": [
            {"species": species, "count": count}
            for species, count in top
        ],
    }


@app.get("/api/export.csv")
def export_csv(db=Depends(get_db)):
    rows = db.query(Analysis).order_by(Analysis.id).all()
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(
        [
            "image_name",
            "predicted_species",
            "confidence",
            "analysis_date",
            "description",
        ]
    )

    for row in rows:
        writer.writerow(
            [
                row.image_name,
                row.predicted_species,
                f"{row.confidence:.4f}",
                row.analysis_date.isoformat()
                if row.analysis_date
                else "",
                row.description,
            ]
        )

    content = "\ufeff" + output.getvalue()

    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="bird_analysis.csv"'
        },
    )


@app.get("/api/birds")
def list_birds(db=Depends(get_db)):
    rows = db.query(BirdInfo).order_by(BirdInfo.species.asc()).all()
    return [bird_info_to_dict(row) for row in rows]


@app.get("/api/birds/{species}")
def get_bird(species: str, db=Depends(get_db)):
    info = find_info(db, species)

    if info is None:
        raise HTTPException(
            status_code=404,
            detail="Bird info not found",
        )

    return bird_info_to_dict(info)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
