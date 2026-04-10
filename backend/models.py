"""
models.py — SQLAlchemy ORM 모델 정의 (PostgreSQL)
"""

from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from database import Base


class ReservationStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    cancelled = "cancelled"
    completed = "completed"


class Equipment(Base):
    """연구 장비 테이블"""
    __tablename__ = "equipment"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)           # 장비명 (예: XRD, SEM, TEM)
    description = Column(Text, nullable=True)            # 장비 설명
    location = Column(String(100), nullable=True)        # 장비 위치
    status = Column(String(50), default="available")     # available / in_use / maintenance
    created_at = Column(DateTime, default=datetime.utcnow)

    reservations = relationship("Reservation", back_populates="equipment")


class User(Base):
    """사용자(연구자) 테이블"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    role = Column(String(50), default="researcher")      # researcher / admin
    created_at = Column(DateTime, default=datetime.utcnow)

    reservations = relationship("Reservation", back_populates="user")
    logs = relationship("UsageLog", back_populates="user")


class Reservation(Base):
    """장비 예약 테이블"""
    __tablename__ = "reservations"

    id = Column(Integer, primary_key=True, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    purpose = Column(Text, nullable=True)               # 사용 목적
    status = Column(
        Enum(ReservationStatus),
        default=ReservationStatus.pending
    )
    created_at = Column(DateTime, default=datetime.utcnow)

    equipment = relationship("Equipment", back_populates="reservations")
    user = relationship("User", back_populates="reservations")


class ChatRoom(Base):
    """닉네임 기반 채팅방 테이블"""
    __tablename__ = "chat_rooms"

    id = Column(Integer, primary_key=True, index=True)
    nickname = Column(String(50), nullable=False)           # 사용자 닉네임
    room_name = Column(String(100), nullable=False)         # 방 이름
    created_at = Column(DateTime, default=datetime.utcnow)

    messages = relationship("ChatHistory", back_populates="room", cascade="all, delete-orphan")


class ChatHistory(Base):
    """채팅 대화 기록 테이블"""
    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("chat_rooms.id"), nullable=False)
    role = Column(String(20), nullable=False)               # "user" | "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    room = relationship("ChatRoom", back_populates="messages")


class UsageLog(Base):
    """장비 사용 로그 테이블"""
    __tablename__ = "usage_logs"

    id = Column(Integer, primary_key=True, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reservation_id = Column(Integer, ForeignKey("reservations.id"), nullable=True)
    action = Column(String(50), nullable=False)         # start / end / error
    note = Column(Text, nullable=True)
    logged_at = Column(DateTime, default=datetime.utcnow)

    equipment = relationship("Equipment")
    user = relationship("User", back_populates="logs")
