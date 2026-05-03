"""
routers/noshow.py — 노쇼(No-Show) 감지 및 스택/사용금지 관리 API

[노쇼 판단 로직]
- 예약 시작 시간 + 5분 이후까지 checkin_time 이 NULL이면 노쇼로 처리
- 사용자 전체 노쇼 스택을 1씩 누적
- 스택이 3의 배수가 될 때마다 해당 장비 3일 사용 금지

[스케줄러]
- main.py 의 APScheduler가 1분마다 check_noshows() 를 호출
"""

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel
import logging

from database import get_db
from models import (
    Reservation, ReservationStatus,
    NoShowRecord, EquipmentBan, User, Equipment
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/noshows", tags=["noshows"])

NOSHOW_GRACE_MINUTES = 5    # 예약 시작 후 체크인 유예 시간 (분)
BAN_DAYS = 3                # 사용 금지 기간 (일)
BAN_THRESHOLD = 3           # 몇 번마다 밴을 부과할지


# ─── Pydantic 스키마 ────────────────────────────────────────────────────────────

class NoShowRecordResponse(BaseModel):
    id: int
    user_id: int
    equipment_id: int
    reservation_id: int
    stack_at_time: int
    created_at: datetime

    class Config:
        from_attributes = True


class EquipmentBanResponse(BaseModel):
    id: int
    user_id: int
    equipment_id: int
    banned_from: datetime
    banned_until: datetime
    reason: Optional[str]
    is_active: bool = False

    class Config:
        from_attributes = True


class UserNoShowStatus(BaseModel):
    user_id: int
    user_name: str
    total_noshow_count: int          # 전체 누적 노쇼 횟수
    current_stack: int               # 현재 스택 위치 (1~3 사이클 내 위치)
    active_bans: List[EquipmentBanResponse]
    recent_noshows: List[NoShowRecordResponse]


# ─── 핵심 비즈니스 로직 ─────────────────────────────────────────────────────────

def process_single_noshow(reservation: Reservation, db: Session) -> NoShowRecord:
    """
    단일 예약에 대해 노쇼 처리:
    1. NoShowRecord 생성
    2. 해당 사용자의 총 노쇼 수 계산
    3. 3의 배수면 해당 장비 3일 밴 발행
    4. 예약 상태를 cancelled로 변경
    """
    # 이미 처리된 노쇼인지 확인
    existing = db.query(NoShowRecord).filter(
        NoShowRecord.reservation_id == reservation.id
    ).first()
    if existing:
        return existing

    # 해당 사용자의 총 노쇼 수 (새 건 포함)
    prev_count = db.query(func.count(NoShowRecord.id)).filter(
        NoShowRecord.user_id == reservation.user_id
    ).scalar() or 0
    new_stack = prev_count + 1

    # NoShowRecord 생성
    record = NoShowRecord(
        user_id=reservation.user_id,
        equipment_id=reservation.equipment_id,
        reservation_id=reservation.id,
        stack_at_time=new_stack,
    )
    db.add(record)

    # 예약 상태 → cancelled
    reservation.status = ReservationStatus.cancelled
    db.flush()

    logger.warning(
        "노쇼 처리: 사용자 #%d, 장비 #%d, 예약 #%d → 누적 스택 %d",
        reservation.user_id, reservation.equipment_id, reservation.id, new_stack
    )

    # 3의 배수마다 해당 장비 사용 금지
    if new_stack % BAN_THRESHOLD == 0:
        now = datetime.utcnow()
        ban = EquipmentBan(
            user_id=reservation.user_id,
            equipment_id=reservation.equipment_id,
            banned_from=now,
            banned_until=now + timedelta(days=BAN_DAYS),
            reason=f"노쇼 {new_stack}회 누적 — 장비 {BAN_DAYS}일 사용 금지",
        )
        db.add(ban)
        logger.warning(
            "사용 금지 발행: 사용자 #%d, 장비 #%d → %s까지",
            reservation.user_id, reservation.equipment_id, ban.banned_until
        )

    db.commit()
    db.refresh(record)
    return record


def check_noshows(db: Session) -> int:
    """
    [스케줄러 진입점] 노쇼 대상 예약을 찾아 일괄 처리
    - 예약 start_time + GRACE_MINUTES < 현재 시각
    - checkin_time 이 NULL
    - status 가 pending / confirmed (아직 취소·완료 아닌 건)
    반환: 이번에 처리된 노쇼 건수
    """
    threshold = datetime.utcnow() - timedelta(minutes=NOSHOW_GRACE_MINUTES)

    candidates = db.query(Reservation).filter(
        Reservation.start_time <= threshold,
        Reservation.checkin_time == None,           # noqa: E711
        Reservation.status.in_([ReservationStatus.pending, ReservationStatus.confirmed]),
    ).all()

    count = 0
    for r in candidates:
        process_single_noshow(r, db)
        count += 1

    if count:
        logger.info("노쇼 자동 처리 완료: %d건", count)
    return count


# ─── 엔드포인트 ─────────────────────────────────────────────────────────────────

@router.get("/status/{user_id}", response_model=UserNoShowStatus)
def get_user_noshow_status(user_id: int, db: Session = Depends(get_db)):
    """특정 사용자의 노쇼 현황 조회 (누적 스택, 활성 밴, 최근 노쇼 기록)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    total_count = db.query(func.count(NoShowRecord.id)).filter(
        NoShowRecord.user_id == user_id
    ).scalar() or 0

    current_stack = total_count % BAN_THRESHOLD or (BAN_THRESHOLD if total_count and total_count % BAN_THRESHOLD == 0 else 0)

    now = datetime.utcnow()
    active_bans_raw = db.query(EquipmentBan).filter(
        EquipmentBan.user_id == user_id,
        EquipmentBan.banned_until > now,
    ).all()

    active_bans = [
        EquipmentBanResponse(
            **{c.key: getattr(b, c.key) for c in b.__table__.columns},
            is_active=True,
        )
        for b in active_bans_raw
    ]

    recent_noshows = db.query(NoShowRecord).filter(
        NoShowRecord.user_id == user_id
    ).order_by(NoShowRecord.created_at.desc()).limit(10).all()

    return UserNoShowStatus(
        user_id=user_id,
        user_name=user.name,
        total_noshow_count=total_count,
        current_stack=current_stack,
        active_bans=active_bans,
        recent_noshows=recent_noshows,
    )


@router.get("/bans/active", response_model=List[EquipmentBanResponse])
def get_active_bans(db: Session = Depends(get_db)):
    """현재 활성 상태인 모든 사용 금지 목록 (관리자용)"""
    now = datetime.utcnow()
    bans = db.query(EquipmentBan).filter(EquipmentBan.banned_until > now).all()
    return [
        EquipmentBanResponse(
            **{c.key: getattr(b, c.key) for c in b.__table__.columns},
            is_active=True,
        )
        for b in bans
    ]


@router.post("/trigger-check")
def trigger_noshow_check(db: Session = Depends(get_db)):
    """노쇼 수동 체크 트리거 (테스트/관리자용)"""
    count = check_noshows(db)
    return {"processed": count, "message": f"노쇼 {count}건 처리 완료"}


def is_user_banned(user_id: int, equipment_id: int, db: Session) -> Optional[EquipmentBan]:
    """예약 생성 전 사용 금지 여부 확인 (reservation.py 에서 호출)"""
    now = datetime.utcnow()
    return db.query(EquipmentBan).filter(
        EquipmentBan.user_id == user_id,
        EquipmentBan.equipment_id == equipment_id,
        EquipmentBan.banned_until > now,
    ).first()
