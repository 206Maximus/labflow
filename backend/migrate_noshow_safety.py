"""
migrate_noshow_safety.py
노쇼 / 안전 교육 기능에 필요한 DB 컬럼 및 테이블 추가 마이그레이션

실행 방법:
  cd backend
  python migrate_noshow_safety.py

PostgreSQL (psycopg2) 또는 SQLite 둘 다 지원.
SQLAlchemy의 create_all()은 이미 존재하는 테이블은 건드리지 않으므로
새 테이블(noshow_records, equipment_bans)은 자동 생성됩니다.
기존 users 테이블에 새 컬럼이 없으면 ALTER TABLE로 추가합니다.
"""

import os
import sys
from sqlalchemy import text, inspect

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from database import engine, Base
import models  # noqa: F401 — 모든 모델 import 필요 (테이블 등록)


def column_exists(conn, table, column):
    inspector = inspect(engine)
    cols = [c["name"] for c in inspector.get_columns(table)]
    return column in cols


def run():
    print("=== LabFlow 마이그레이션: 노쇼 / 안전 교육 ===")

    # 1. 새 테이블 자동 생성 (noshow_records, equipment_bans)
    Base.metadata.create_all(bind=engine)
    print("[OK] noshow_records, equipment_bans 테이블 생성 완료 (이미 있으면 스킵)")

    # 2. users 테이블에 새 컬럼 추가 (안전 교육 + 로그인 인증)
    new_columns = [
        ("hashed_password",         "VARCHAR(255) NULL"),
        ("safety_certified",        "BOOLEAN DEFAULT FALSE"),
        ("safety_certified_at",     "TIMESTAMP NULL"),
        ("safety_certified_by",     "INTEGER NULL"),
        ("safety_reminder_sent_at", "TIMESTAMP NULL"),
    ]

    with engine.connect() as conn:
        for col_name, col_def in new_columns:
            if not column_exists(conn, "users", col_name):
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}"))
                conn.commit()
                print(f"[OK] users.{col_name} 컬럼 추가")
            else:
                print(f"[SKIP] users.{col_name} 이미 존재")

    print("\n=== 마이그레이션 완료 ===")


if __name__ == "__main__":
    run()
