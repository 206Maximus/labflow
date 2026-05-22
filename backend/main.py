"""
main.py -- LabFlow FastAPI 애플리케이션 진입점
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

load_dotenv()  # .env 파일 자동 로드

from database import engine, Base, SessionLocal
from routers import reservation, logs, chat, rooms, gcal
from routers import noshow as noshow_router
from routers import safety as safety_router
from routers import auth as auth_router
from routers import manuals as manuals_router
from routers.noshow import check_noshows
from routers.safety import get_reminder_needed

logger = logging.getLogger(__name__)

# --- 테이블 자동 생성 (개발 환경) ---
Base.metadata.create_all(bind=engine)


# --- 스케줄러 작업 ---

def scheduled_noshow_check():
    """1분마다 실행 - 노쇼 자동 감지 및 처리"""
    db = SessionLocal()
    try:
        count = check_noshows(db)
        if count:
            logger.info("[스케줄러] 노쇼 처리 완료: %d건", count)
    except Exception as e:
        logger.error("[스케줄러] 노쇼 체크 오류: %s", e)
    finally:
        db.close()


def scheduled_safety_reminder():
    """매일 실행 - 3개월 경과 안전 교육 리마인드 대상자 로깅"""
    db = SessionLocal()
    try:
        users = get_reminder_needed(db)
        if users:
            names = ", ".join(u.user_name for u in users)
            logger.warning(
                "[스케줄러] 안전 교육 3개월 리마인드 대상자 %d명: %s",
                len(users), names
            )
    except Exception as e:
        logger.error("[스케줄러] 안전 교육 리마인드 체크 오류: %s", e)
    finally:
        db.close()


# --- Lifespan (시작/종료 훅) ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    """서버 시작 시 스케줄러 등록, 종료 시 정리"""
    scheduler = BackgroundScheduler(timezone="UTC")

    scheduler.add_job(
        scheduled_noshow_check,
        trigger=IntervalTrigger(minutes=1),
        id="noshow_check",
        name="노쇼 자동 감지",
        replace_existing=True,
    )

    scheduler.add_job(
        scheduled_safety_reminder,
        trigger=IntervalTrigger(days=1),
        id="safety_reminder",
        name="안전 교육 3개월 리마인드",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("APScheduler 시작 완료")

    yield  # 서버 실행 중

    scheduler.shutdown(wait=False)
    logger.info("APScheduler 종료")


# --- FastAPI 앱 초기화 ---
app = FastAPI(
    title="LabFlow API",
    description="연구실 장비 관리 플랫폼 -- 예약, 로그, AI 챗봇 통합 API",
    version="0.3.0",
    lifespan=lifespan,
)

# --- CORS 설정 ---
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

# --- 라우터 등록 ---
app.include_router(reservation.router, prefix="/api/v1")
app.include_router(logs.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(rooms.router, prefix="/api/v1")
app.include_router(gcal.router, prefix="/api/v1")
app.include_router(noshow_router.router, prefix="/api/v1")
app.include_router(safety_router.router, prefix="/api/v1")
app.include_router(auth_router.router, prefix="/api/v1")
app.include_router(manuals_router.router, prefix="/api/v1")


# --- 헬스체크 ---
@app.get("/", tags=["health"])
def root():
    return {"status": "ok", "message": "LabFlow API is running"}


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "healthy"}
