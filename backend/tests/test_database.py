from sqlalchemy import inspect, text

from app.database import Base, SessionLocal, engine, ensure_schema, get_db


def test_get_db_yields_and_closes_session():
    generator = get_db()
    session = next(generator)

    assert session is not None

    try:
        next(generator)
    except StopIteration:
        pass


def test_ensure_schema_returns_when_analyses_table_missing():
    Base.metadata.drop_all(bind=engine)

    ensure_schema()

    assert "analyses" not in inspect(engine).get_table_names()


def test_ensure_schema_returns_when_column_exists():
    ensure_schema()

    columns = {column["name"] for column in inspect(engine).get_columns("analyses")}

    assert "stored_name" in columns


def test_ensure_schema_adds_missing_column():
    Base.metadata.drop_all(bind=engine)

    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE analyses ("
                "id INTEGER PRIMARY KEY, "
                "image_name VARCHAR(255) NOT NULL, "
                "predicted_species VARCHAR(100) NOT NULL, "
                "confidence FLOAT NOT NULL)"
            )
        )

    ensure_schema()

    columns = {column["name"] for column in inspect(engine).get_columns("analyses")}

    assert "stored_name" in columns
