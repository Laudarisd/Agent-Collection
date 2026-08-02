import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker


Base = declarative_base()


def _sqlite_default_path() -> Path:
    db_dir = Path(__file__).resolve().parent.parent / "database"
    db_dir.mkdir(parents=True, exist_ok=True)
    return db_dir / "app.db"


def build_database_url() -> str:
    explicit_url = os.getenv("DATABASE_URL", "").strip()
    if explicit_url:
        return explicit_url

    mysql_host = os.getenv("MYSQL_HOST", "").strip()
    mysql_port = os.getenv("MYSQL_PORT", "").strip()
    mysql_user = os.getenv("MYSQL_USER", "").strip()
    mysql_password = os.getenv("MYSQL_PASSWORD", "").strip()
    mysql_db = os.getenv("MYSQL_DB", "").strip()

    if all([mysql_host, mysql_port, mysql_user, mysql_password, mysql_db]):
        return (
            f"mysql+pymysql://{mysql_user}:{mysql_password}"
            f"@{mysql_host}:{mysql_port}/{mysql_db}"
        )

    return f"sqlite:///{_sqlite_default_path()}"


DATABASE_URL = build_database_url()
IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if IS_SQLITE else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _run_lightweight_migrations()


def _run_lightweight_migrations() -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    if "prompts" not in table_names:
        return

    prompt_columns = {column["name"] for column in inspector.get_columns("prompts")}
    with engine.begin() as connection:
        if "session_id" not in prompt_columns:
            connection.execute(text("ALTER TABLE prompts ADD COLUMN session_id INTEGER"))

    if "chat_sessions" in table_names:
        session_columns = {column["name"] for column in inspector.get_columns("chat_sessions")}
        with engine.begin() as connection:
            if "deleted_at" not in session_columns:
                connection.execute(text("ALTER TABLE chat_sessions ADD COLUMN deleted_at DATETIME"))
            if "renamed_at" not in session_columns:
                connection.execute(text("ALTER TABLE chat_sessions ADD COLUMN renamed_at DATETIME"))


def get_database_mode() -> str:
    if DATABASE_URL.startswith("mysql"):
        return "mysql"
    return "sqlite"
