from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import DATABASE_URL

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


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


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
