"""
main.py — LabFlow FastAPI 애플리케이션 진입점
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
load_dotenv()  # .env 파일 자동 로드

from database import engine, Base
from routers import reservation, logs, chat, rooms

# ─── 테이블 자동 생성 (개발 환경) ────────────────────────────────────────────────
Base.metadata.create_all(bind=engine)

# ─── FastAPI 앱 초기화 ───────────────────────────────────────────────────────────
app = FastAPI(
    title="LabFlow API",
    description="연구실 장비 관리 플랫폼 — 예약, 로그, AI 챗봇 통합 API",
    version="0.1.0",
)

# ─── CORS 설정 ──────────────────────────────────────────────────────────────────
# 개발 환경: React dev server (localhost:3000) 허용
# 배포 시 origins를 실제 도메인으로 교체
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── 라우터 등록 ─────────────────────────────────────────────────────────────────
app.include_router(reservation.router, prefix="/api/v1")
app.include_router(logs.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(rooms.router, prefix="/api/v1")


# ─── 헬스체크 ───────────────────────────────────────────────────────────────────
@app.get("/", tags=["health"])
def root():
    return {"status": "ok", "message": "LabFlow API is running 🚀"}


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "healthy"}
