import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
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
