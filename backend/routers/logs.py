"""
routers/logs.py — 장비 사용 로그 API 라우터
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
from models import UsageLog

router = APIRouter(prefix="/logs", tags=["logs"])


# ─── Pydantic 스키마 ────────────────────────────────────────────────────────────

class LogCreate(BaseModel):
    equipment_id: int
    user_id: int
    reservation_id: Optional[int] = None
    action: str          # "start" | "end" | "error"
    note: Optional[str] = None


class LogResponse(BaseModel):
    id: int
    equipment_id: int
    user_id: int
    reservation_id: Optional[int]
    action: str
    note: Optional[str]
    logged_at: datetime

    class Config:
        from_attributes = True


# ─── 엔드포인트 ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[LogResponse])
def get_all_logs(
    skip: int = 0,
    limit: int = 100,
    equipment_id: Optional[int] = None,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """사용 로그 목록 조회 (장비/사용자 필터링 가능)"""
    query = db.query(UsageLog)
    if equipment_id:
        query = query.filter(UsageLog.equipment_id == equipment_id)
    if user_id:
        query = query.filter(UsageLog.user_id == user_id)
    return query.order_by(UsageLog.logged_at.desc()).offset(skip).limit(limit).all()


@router.get("/{log_id}", response_model=LogResponse)
def get_log(log_id: int, db: Session = Depends(get_db)):
    """특정 로그 조회"""
    log = db.query(UsageLog).filter(UsageLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="로그를 찾을 수 없습니다.")
    return log


@router.post("/", response_model=LogResponse, status_code=status.HTTP_201_CREATED)
def create_log(data: LogCreate, db: Session = Depends(get_db)):
    """새 사용 로그 기록 (장비 사용 시작/종료 시 자동 호출)"""
    log = UsageLog(**data.dict())
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get("/equipment/{equipment_id}/summary")
def get_equipment_summary(equipment_id: int, db: Session = Depends(get_db)):
    """특정 장비의 사용 통계 요약"""
    logs = db.query(UsageLog).filter(UsageLog.equipment_id == equipment_id).all()
    total = len(logs)
    actions = {}
    for log in logs:
        actions[log.action] = actions.get(log.action, 0) + 1
    return {
        "equipment_id": equipment_id,
        "total_logs": total,
        "action_counts": actions
    }
