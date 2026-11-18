import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

sys.path.insert(0, str(ROOT))

TEST_DB_PATH = Path(tempfile.gettempdir()) / "aibirdlab_pytest.db"

if TEST_DB_PATH.exists():
    TEST_DB_PATH.unlink()

os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"
os.environ["PAYMENT_ENABLED"] = "false"
os.environ["AI_SERVER_URL"] = "http://ai.test"
os.environ["ETH_RPC_URL"] = "http://rpc.test"
os.environ["BIRD_INFO_FILE"] = str(ROOT / "bird_info.json")

import pytest
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.main import app


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    yield


@pytest.fixture
def db():
    session = SessionLocal()

    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def upload_dir(monkeypatch, tmp_path):
    target = tmp_path / "uploads"
    target.mkdir()

    import app.routers.analyses as analyses_router
    import app.services as services

    monkeypatch.setattr(services, "UPLOAD_DIR", target)
    monkeypatch.setattr(analyses_router, "UPLOAD_DIR", target)

    return target
