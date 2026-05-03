"""
routers/gcal.py — Google Calendar 연동 API 라우터

[엔드포인트]
  GET  /gcal/status   — 연동 상태 확인
  GET  /gcal/auth     — Google OAuth2 인증 URL 반환
  GET  /gcal/callback  — OAuth2 콜백 (토큰 교환)
  POST /gcal/sync      — 기존 예약 일괄 동기화
  POST /gcal/disconnect — 연동 해제
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models import Reservation, ReservationStatus
from services.google_calendar import (
    get_auth_url,
    exchange_code,
    is_connected,
    disconnect,
    sync_all_reservations,
)

router = APIRouter(prefix="/gcal", tags=["google-calendar"])


# ─── 응답 스키마 ───────────────────────────────────────────────────────────────

class GCalStatusResponse(BaseModel):
    connected: bool
    message: str


class GCalAuthResponse(BaseModel):
    auth_url: str


class GCalSyncResponse(BaseModel):
    success: bool
    synced: int
    failed: int
    skipped: int
    message: str


# ─── 엔드포인트 ─────────────────────────────────────────────────────────────────

@router.get("/status", response_model=GCalStatusResponse)
def gcal_status():
    """Google Calendar 연동 상태 확인"""
    connected = is_connected()
    return GCalStatusResponse(
        connected=connected,
        message="Google Calendar 연동됨" if connected else "연동되지 않음",
    )


@router.get("/auth", response_model=GCalAuthResponse)
def gcal_auth():
    """
    Google OAuth2 인증 URL 반환
    프론트에서 이 URL로 리다이렉트하면 Google 로그인 화면이 나타남
    """
    try:
        auth_url = get_auth_url()
        return GCalAuthResponse(auth_url=auth_url)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/callback")
def gcal_callback(code: str = Query(...), error: Optional[str] = Query(None)):
    """
    Google OAuth2 콜백 — Google이 인증 코드를 보내주면 토큰으로 교환
    성공 시 프론트엔드로 리다이렉트
    """
    if error:
        # 사용자가 권한을 거부한 경우
        return RedirectResponse(
            url=f"http://localhost:3000?gcal_error={error}"
        )

    try:
        exchange_code(code)
        # 성공 → 프론트엔드로 리다이렉트 (성공 플래그)
        return RedirectResponse(
            url="http://localhost:3000?gcal_connected=true"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"토큰 교환 실패: {str(e)}"
        )


@router.post("/sync", response_model=GCalSyncResponse)
def gcal_sync(db: Session = Depends(get_db)):
    """
    기존 예약을 Google Calendar에 일괄 동기화
    - 취소되지 않은 모든 예약을 대상
    - 이미 동기화된 예약(gcal_event_id 있음)은 건너뜀
    """
    if not is_connected():
        raise HTTPException(
            status_code=400,
            detail="Google Calendar이 연동되지 않았습니다. 먼저 /gcal/auth로 인증해주세요."
        )

    # 취소되지 않은 예약 조회
    reservations = db.query(Reservation).filter(
        Reservation.status != ReservationStatus.cancelled
    ).all()

    result = sync_all_reservations(reservations)

    # gcal_event_id 업데이트 저장
    db.commit()

    return GCalSyncResponse(
        success=True,
        synced=result["synced"],
        failed=result["failed"],
        skipped=result["skipped"],
        message=f"동기화 완료: {result['synced']}개 생성, {result['skipped']}개 건너뜀",
    )


@router.post("/disconnect", response_model=GCalStatusResponse)
def gcal_disconnect():
    """Google Calendar 연동 해제"""
    disconnect()
    return GCalStatusResponse(
        connected=False,
        message="Google Calendar 연동이 해제되었습니다.",
    )
