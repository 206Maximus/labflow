"""
migrate_add_gcal.py — DB 마이그레이션: reservations 테이블에 gcal_event_id 컬럼 추가

[실행 방법]
  cd backend
  python migrate_add_gcal.py
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "labflow_dev.db"


def migrate():
    if not DB_PATH.exists():
        print(f"❌ DB 파일을 찾을 수 없습니다: {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 이미 컬럼이 있는지 확인
    cursor.execute("PRAGMA table_info(reservations)")
    columns = [row[1] for row in cursor.fetchall()]

    if "gcal_event_id" in columns:
        print("✅ gcal_event_id 컬럼이 이미 존재합니다. 마이그레이션 불필요.")
    else:
        cursor.execute(
            "ALTER TABLE reservations ADD COLUMN gcal_event_id VARCHAR(255) DEFAULT NULL"
        )
        conn.commit()
        print("✅ gcal_event_id 컬럼 추가 완료!")

    conn.close()
    print("마이그레이션 완료.")


if __name__ == "__main__":
    migrate()
