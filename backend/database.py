"""
database.py — DB 연결 설정 (SQLAlchemy)

[개발 환경 선택]
  - SQLite  : PostgreSQL 없이 바로 실행 가능 (기본값)
  - PostgreSQL: DB_MODE=postgres 환경변수 설정 또는 DATABASE_URL 직접 지정
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

DB_MODE = os.getenv("DB_MODE", "sqlite")  # "sqlite" 또는 "postgres"

if DB_MODE == "postgres":
    # PostgreSQL 설치 후 사용
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "postgresql://labflow_user:labflow_pass@localhost:5432/labflow"
    )
    engine = create_engine(DATABASE_URL)
else:
    # SQLite — 별도 설치 없이 바로 사용 가능 (개발/프로토타입용)
    DATABASE_URL = "sqlite:///./labflow_dev.db"
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}  # FastAPI 멀티스레드 대응
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI Dependency Injection용 DB 세션 제공 함수"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
