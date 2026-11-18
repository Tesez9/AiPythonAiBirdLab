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

PAYMENT_ENABLED = os.getenv("PAYMENT_ENABLED", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
ETH_RPC_URL = os.getenv("ETH_RPC_URL", "http://127.0.0.1:8545").strip()
PAYMENT_RECEIVER_ADDRESS = os.getenv(
    "PAYMENT_RECEIVER_ADDRESS",
    "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
).strip()
PAYMENT_CHAIN_ID = int(os.getenv("PAYMENT_CHAIN_ID", "31337"))
PAYMENT_PRICE_WEI = int(
    os.getenv("PAYMENT_PRICE_WEI", "2000000000000000")
)
PAYMENT_CREDITS = int(os.getenv("PAYMENT_CREDITS", "5"))
PAYMENT_CONFIRMATIONS = int(os.getenv("PAYMENT_CONFIRMATIONS", "1"))
PAYMENT_SCAN_BLOCKS = int(os.getenv("PAYMENT_SCAN_BLOCKS", "100"))
PAYMENT_PUBLIC_RPC_URL = os.getenv(
    "PAYMENT_PUBLIC_RPC_URL",
    "http://127.0.0.1:8545",
).strip()
PAYMENT_CHAIN_NAME = os.getenv("PAYMENT_CHAIN_NAME", "Test Net").strip()
PAYMENT_EXPLORER_URL = (
    os.getenv("PAYMENT_EXPLORER_URL", "").strip().rstrip("/")
)

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
