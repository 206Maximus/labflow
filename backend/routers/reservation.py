"""
routers/reservation.py — 예약 관련 API 라우터
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import Reservation, ReservationStatus

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
    created_at: datetime

    class Config:
        from_attributes = True


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
    """새 예약 생성 (챗봇 또는 직접 UI에서 호출)"""
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
    return reservation


@router.patch("/{reservation_id}", response_model=ReservationResponse)
def update_reservation_status(
    reservation_id: int,
    data: ReservationUpdate,
    db: Session = Depends(get_db)
):
    """예약 상태 변경 (confirmed / cancelled 등)"""
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다.")
    reservation.status = data.status
    db.commit()
    db.refresh(reservation)
    return reservation


@router.delete("/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reservation(reservation_id: int, db: Session = Depends(get_db)):
    """예약 삭제"""
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다.")
    db.delete(reservation)
    db.commit()
