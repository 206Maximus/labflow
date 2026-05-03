"""
routers/safety.py — 안전 교육 인증 배지 관리 API

[기능]
1. 관리자가 사용자에게 안전 교육 배지 부여 / 취소
2. 사용자 인증 현황 조회
3. 3개월 리마인드 대상자 목록 조회 (스케줄러에서도 호출)

[인증 흐름]
- 관리자가 POST /safety/certify/{user_id} 호출 → safety_certified = True, safety_certified_at = now
- 예약 생성 시 safety_certified = False이면 차단 (reservation.py에서 체크)
- 매 3개월마다 리마인드: safety_certified_at이 90일 이상 지난 사용자 목록 반환
"""

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel
import logging

from database import get_db
from models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/safety", tags=["safety"])

REMINDER_INTERVAL_DAYS = 90   # 3개월 = 90일


# ─── Pydantic 스키마 ────────────────────────────────────────────────────────────

class SafetyStatusResponse(BaseModel):
    user_id: int
    user_name: str
    email: str
    safety_certified: bool
    safety_certified_at: Optional[datetime]
    safety_certified_by: Optional[int]
    days_since_certification: Optional[int]     # 인증 후 경과일
    needs_reminder: bool                        # 3개월 이상 경과 여부

    class Config:
        from_attributes = True


class CertifyRequest(BaseModel):
    admin_user_id: int   # 배지를 부여하는 관리자 ID


class RevokeCertRequest(BaseModel):
    admin_user_id: int
    reason: Optional[str] = None


# ─── 헬퍼 ──────────────────────────────────────────────────────────────────────

def _build_safety_status(user: User) -> SafetyStatusResponse:
    days = None
    needs_reminder = False
    if user.safety_certified_at:
        days = (datetime.utcnow() - user.safety_certified_at).days
        needs_reminder = days >= REMINDER_INTERVAL_DAYS

    return SafetyStatusResponse(
        user_id=user.id,
        user_name=user.name,
        email=user.email,
        safety_certified=user.safety_certified,
        safety_certified_at=user.safety_certified_at,
        safety_certified_by=user.safety_certified_by,
        days_since_certification=days,
        needs_reminder=needs_reminder,
    )


# ─── 엔드포인트 ─────────────────────────────────────────────────────────────────

@router.get("/status/{user_id}", response_model=SafetyStatusResponse)
def get_safety_status(user_id: int, db: Session = Depends(get_db)):
    """사용자의 안전 교육 인증 현황 조회"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    return _build_safety_status(user)


@router.get("/status", response_model=List[SafetyStatusResponse])
def get_all_safety_status(db: Session = Depends(get_db)):
    """전체 사용자 안전 교육 현황 조회 (관리자용)"""
    users = db.query(User).all()
    return [_build_safety_status(u) for u in users]


@router.post("/certify/{user_id}", response_model=SafetyStatusResponse)
def certify_user(
    user_id: int,
    data: CertifyRequest,
    db: Session = Depends(get_db)
):
    """
    관리자가 사용자에게 안전 교육 배지 부여
    - admin_user_id 의 role이 admin인지 확인
    """
    # 관리자 확인
    admin = db.query(User).filter(User.id == data.admin_user_id).first()
    if not admin or admin.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 권한이 필요합니다."
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    now = datetime.utcnow()
    user.safety_certified = True
    user.safety_certified_at = now
    user.safety_certified_by = data.admin_user_id
    user.safety_reminder_sent_at = now   # 인증 시점을 리마인드 기준으로 초기화

    db.commit()
    db.refresh(user)

    logger.info(
        "안전 교육 배지 부여: 사용자 #%d (%s) ← 관리자 #%d",
        user_id, user.name, data.admin_user_id
    )
    return _build_safety_status(user)


@router.delete("/certify/{user_id}", response_model=SafetyStatusResponse)
def revoke_certification(
    user_id: int,
    data: RevokeCertRequest,
    db: Session = Depends(get_db)
):
    """관리자가 사용자의 안전 교육 인증 취소"""
    admin = db.query(User).filter(User.id == data.admin_user_id).first()
    if not admin or admin.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 권한이 필요합니다."
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    user.safety_certified = False
    db.commit()
    db.refresh(user)

    logger.info(
        "안전 교육 인증 취소: 사용자 #%d (%s) — 사유: %s",
        user_id, user.name, data.reason or "없음"
    )
    return _build_safety_status(user)


@router.get("/reminder-needed", response_model=List[SafetyStatusResponse])
def get_reminder_needed(db: Session = Depends(get_db)):
    """
    3개월 리마인드 대상자 목록 반환
    - safety_certified = True
    - safety_certified_at 이 90일 이상 경과
    (스케줄러 및 관리자 대시보드에서 호출)
    """
    cutoff = datetime.utcnow() - timedelta(days=REMINDER_INTERVAL_DAYS)
    users = db.query(User).filter(
        User.safety_certified == True,          # noqa: E712
        User.safety_certified_at <= cutoff,
    ).all()

    logger.info("3개월 리마인드 대상자: %d명", len(users))
    return [_build_safety_status(u) for u in users]


@router.post("/reminder/mark-sent/{user_id}")
def mark_reminder_sent(user_id: int, db: Session = Depends(get_db)):
    """리마인드 발송 완료 처리 (이메일 발송 후 호출)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    user.safety_reminder_sent_at = datetime.utcnow()
    db.commit()
    return {"message": f"사용자 {user.name} 리마인드 발송 완료 처리"}


def is_user_safety_certified(user_id: int, db: Session) -> bool:
    """예약 생성 전 안전 교육 인증 여부 확인 (reservation.py에서 호출)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return False
    return user.safety_certified
