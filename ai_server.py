import io
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from transformers import pipeline

MODEL_NAME = os.getenv(
    "BIRD_MODEL",
    "dennisjooo/Birds-Classifier-EfficientNetB2",
)
CONFIDENCE_LIMIT = 0.6
MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}

ALIASES = {
    "crested shriketit": "Crested Shrike-tit",
    "trumpter swan": "Trumpeter Swan",
}

classifier = None
model_error = None


def display_species(label):
    key = str(label).strip().lower()

    if key in ALIASES:
        return ALIASES[key]

    return str(label).strip().title()


@asynccontextmanager
async def lifespan(app):
    global classifier
    global model_error

    print("Loading model:", MODEL_NAME)

    try:
        classifier = pipeline("image-classification", model=MODEL_NAME)
        print("Model loaded")
    except Exception as error:
        model_error = str(error)
        print("Model loading failed:", error)

    yield

    classifier = None


app = FastAPI(
    title="Bird AI Server",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/")
def root():
    return {
        "service": "bird-ai-server",
        "model": MODEL_NAME,
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {
        "status": "ok" if classifier is not None else "error",
        "model": MODEL_NAME,
        "model_loaded": classifier is not None,
        "error": model_error,
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if classifier is None:
        raise HTTPException(
            status_code=503,
            detail="Model is not loaded",
        )

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

    try:
        with Image.open(io.BytesIO(data)) as image:
            image = image.convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(
            status_code=400,
            detail="Invalid image file",
        )

    try:
        result = classifier(image, top_k=3)
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {error}",
        )

    top = result[0]
    confidence = float(top["score"])

    top3 = []

    for item in result[:3]:
        top3.append(
            {
                "species": display_species(item["label"]),
                "confidence": round(float(item["score"]), 4),
            }
        )

    return {
        "filename": filename,
        "predicted_species": display_species(top["label"]),
        "confidence": round(confidence, 4),
        "low_confidence": confidence < CONFIDENCE_LIMIT,
        "top3": top3,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
