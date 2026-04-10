"""
routers/rooms.py — 닉네임 기반 채팅방 관리 API
"""

import os, sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from database import get_db
from models import ChatRoom, ChatHistory

router = APIRouter(prefix="/rooms", tags=["rooms"])


# ─── 스키마 ──────────────────────────────────────────────────────────────────────

class RoomCreate(BaseModel):
    nickname: str
    room_name: str


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class RoomResponse(BaseModel):
    id: int
    nickname: str
    room_name: str
    created_at: datetime
    message_count: int = 0

    class Config:
        from_attributes = True


# ─── 엔드포인트 ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[RoomResponse])
def list_rooms(nickname: Optional[str] = None, db: Session = Depends(get_db)):
    """방 목록 조회 (닉네임 필터 가능)"""
    query = db.query(ChatRoom)
    if nickname:
        query = query.filter(ChatRoom.nickname == nickname)
    rooms = query.order_by(ChatRoom.created_at.desc()).all()

    result = []
    for room in rooms:
        result.append(RoomResponse(
            id=room.id,
            nickname=room.nickname,
            room_name=room.room_name,
            created_at=room.created_at,
            message_count=len(room.messages),
        ))
    return result


@router.post("/", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
def create_room(data: RoomCreate, db: Session = Depends(get_db)):
    """새 채팅방 생성"""
    room = ChatRoom(nickname=data.nickname, room_name=data.room_name)
    db.add(room)
    db.commit()
    db.refresh(room)
    return RoomResponse(
        id=room.id,
        nickname=room.nickname,
        room_name=room.room_name,
        created_at=room.created_at,
        message_count=0,
    )


@router.get("/{room_id}/messages", response_model=List[MessageResponse])
def get_messages(room_id: int, db: Session = Depends(get_db)):
    """특정 방의 전체 대화 기록 조회"""
    room = db.query(ChatRoom).filter(ChatRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="채팅방을 찾을 수 없습니다.")
    return db.query(ChatHistory)\
        .filter(ChatHistory.room_id == room_id)\
        .order_by(ChatHistory.created_at.asc())\
        .all()


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_room(room_id: int, db: Session = Depends(get_db)):
    """채팅방 삭제 (대화 기록 포함)"""
    room = db.query(ChatRoom).filter(ChatRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="채팅방을 찾을 수 없습니다.")
    db.delete(room)
    db.commit()
