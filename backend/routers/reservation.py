"""
routers/reservation.py — 예약 관련 API 라우터
예약 생성/수정/삭제 시 Google Calendar 자동 동기화
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional
import logging

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import Reservation, ReservationStatus, User
from routers.noshow import is_user_banned
from routers.safety import is_user_safety_certified
from services.google_calendar import (
    create_event,
    update_event,
    delete_event,
    is_connected as gcal_connected,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reservations", tags=["reservations"])


# ─── Pydantic 스키마 ────────────────────────────────────────────────────────────

class ReservationCreate(BaseModel):
    equipment_id: int
    user_id: int
    start_time: datetime
    end_time: datetime
    purpose: Optional[str] = None


class ReservationUpdate(BaseModel):
    status: ReservationStatus


class ReservationResponse(BaseModel):
    id: int
    equipment_id: int
    user_id: int
    start_time: datetime
    end_time: datetime
    purpose: Optional[str]
    status: ReservationStatus
    checkin_time: Optional[datetime] = None
    checkout_time: Optional[datetime] = None
    early_checkout: bool = False
    gcal_event_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Google Calendar 헬퍼 ──────────────────────────────────────────────────────

def _sync_to_gcal_create(reservation: Reservation, db: Session):
    """예약 생성 시 Google Calendar에 이벤트 추가 (실패해도 예약은 정상 진행)"""
    if not gcal_connected():
        return

    try:
        event_id = create_event(
            equipment_id=reservation.equipment_id,
            user_name=f"User #{reservation.user_id}",
            start_time=reservation.start_time,
            end_time=reservation.end_time,
            purpose=reservation.purpose or "",
            reservation_id=reservation.id,
        )
        if event_id:
            reservation.gcal_event_id = event_id
            db.commit()
            logger.info("예약 #%d → Google Calendar 동기화 완료 (%s)", reservation.id, event_id)
    except Exception as e:
        logger.warning("Google Calendar 동기화 실패 (예약 #%d): %s", reservation.id, e)


def _sync_to_gcal_update(reservation: Reservation, status_text: Optional[str] = None):
    """예약 상태 변경 시 Google Calendar 이벤트 업데이트"""
    if not gcal_connected() or not reservation.gcal_event_id:
        return

    try:
        update_event(
            gcal_event_id=reservation.gcal_event_id,
            end_time=reservation.end_time,
            status_text=status_text,
        )
        logger.info("예약 #%d → Google Calendar 상태 업데이트", reservation.id)
    except Exception as e:
        logger.warning("Google Calendar 업데이트 실패 (예약 #%d): %s", reservation.id, e)


def _sync_to_gcal_delete(reservation: Reservation):
    """예약 삭제 시 Google Calendar 이벤트 삭제"""
    if not gcal_connected() or not reservation.gcal_event_id:
        return

    try:
        delete_event(gcal_event_id=reservation.gcal_event_id)
        logger.info("예약 #%d → Google Calendar 이벤트 삭제", reservation.id)
    except Exception as e:
        logger.warning("Google Calendar 삭제 실패 (예약 #%d): %s", reservation.id, e)


# ─── 엔드포인트 ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ReservationResponse])
def get_all_reservations(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """모든 예약 목록 조회"""
    return db.query(Reservation).offset(skip).limit(limit).all()


@router.get("/{reservation_id}", response_model=ReservationResponse)
def get_reservation(reservation_id: int, db: Session = Depends(get_db)):
    """특정 예약 조회"""
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다.")
    return reservation


@router.post("/", response_model=ReservationResponse, status_code=status.HTTP_201_CREATED)
def create_reservation(data: ReservationCreate, db: Session = Depends(get_db)):
    """새 예약 생성 (챗봇 또는 직접 UI에서 호출) → Google Calendar 자동 동기화"""

    # ── 안전 교육 인증 확인 ─────────────────────────────────────────────────────
    if not is_user_safety_certified(data.user_id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="안전 교육 인증이 완료되지 않은 사용자입니다. 관리자에게 인증을 요청해 주세요."
        )

    # ── 장비 사용 금지 확인 (노쇼 3회 누적 시 3일 금지) ─────────────────────────
    ban = is_user_banned(data.user_id, data.equipment_id, db)
    if ban:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"노쇼 누적으로 인해 해당 장비 사용이 금지되어 있습니다. "
                f"해제 일시: {ban.banned_until.strftime('%Y-%m-%d %H:%M')} (UTC)"
            )
        )

    # 시간 충돌 체크
    conflict = db.query(Reservation).filter(
        Reservation.equipment_id == data.equipment_id,
        Reservation.status != ReservationStatus.cancelled,
        Reservation.start_time < data.end_time,
        Reservation.end_time > data.start_time,
    ).first()

    if conflict:
        raise HTTPException(
            status_code=409,
            detail="해당 시간대에 이미 예약이 존재합니다."
        )

    reservation = Reservation(**data.dict())
    db.add(reservation)
    db.commit()
    db.refresh(reservation)

    # ✅ Google Calendar 동기화
    _sync_to_gcal_create(reservation, db)

    return reservation


@router.patch("/{reservation_id}", response_model=ReservationResponse)
def update_reservation_status(
    reservation_id: int,
    data: ReservationUpdate,
    db: Session = Depends(get_db)
):
    """예약 상태 변경 (confirmed / cancelled 등) → Google Calendar 업데이트"""
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다.")

    reservation.status = data.status
    db.commit()
    db.refresh(reservation)

    # ✅ Google Calendar 상태 업데이트
    status_map = {
        ReservationStatus.confirmed: "[예약확정]",
        ReservationStatus.cancelled: "[취소]",
        ReservationStatus.completed: "[완료]",
    }
    _sync_to_gcal_update(reservation, status_map.get(data.status))

    # 취소 시 Google Calendar 이벤트도 삭제
    if data.status == ReservationStatus.cancelled:
        _sync_to_gcal_delete(reservation)

    return reservation


@router.delete("/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reservation(reservation_id: int, db: Session = Depends(get_db)):
    """예약 삭제 → Google Calendar 이벤트도 삭제"""
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다.")

    # ✅ Google Calendar 이벤트 삭제
    _sync_to_gcal_delete(reservation)

    db.delete(reservation)
    db.commit()


@router.post("/{reservation_id}/checkin", response_model=ReservationResponse)
def checkin(reservation_id: int, db: Session = Depends(get_db)):
    """장비 체크인 — 실제 사용 시작 시각 기록 → Google Calendar 업데이트"""
    r = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다.")
    if r.checkin_time:
        raise HTTPException(status_code=400, detail="이미 체크인된 예약입니다.")
    r.checkin_time = datetime.utcnow()
    r.status = ReservationStatus.confirmed
    db.commit()
    db.refresh(r)

    # ✅ Google Calendar 업데이트
    _sync_to_gcal_update(r, "[사용중]")

    return r


@router.post("/{reservation_id}/checkout", response_model=ReservationResponse)
def checkout(reservation_id: int, db: Session = Depends(get_db)):
    """장비 체크아웃 — 실제 사용 종료, 조기 완료 여부 자동 판단 → Google Calendar 업데이트"""
    r = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다.")
    if not r.checkin_time:
        raise HTTPException(status_code=400, detail="먼저 체크인이 필요합니다.")
    if r.checkout_time:
        raise HTTPException(status_code=400, detail="이미 체크아웃된 예약입니다.")

    now = datetime.utcnow()
    r.checkout_time = now
    r.status = ReservationStatus.completed

    # 예정 종료 시각보다 5분 이상 일찍 끝나면 early_checkout 표시
    if now < r.end_time and (r.end_time - now).total_seconds() > 300:
        r.early_checkout = True
        r.end_time = now   # 실제 종료 시각으로 업데이트 (다음 사용자 예약 가능)

    db.commit()
    db.refresh(r)

    # ✅ Google Calendar 업데이트
    status_text = "[조기완료]" if r.early_checkout else "[완료]"
    _sync_to_gcal_update(r, status_text)

    return r
