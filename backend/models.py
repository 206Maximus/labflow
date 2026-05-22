"""
models.py — SQLAlchemy ORM 모델 정의 (PostgreSQL)
"""

from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, Text, Boolean, UniqueConstraint
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
    hashed_password = Column(String(255), nullable=True)    # bcrypt 해시 (기존 계정 호환을 위해 nullable)
    role = Column(String(50), default="researcher")      # researcher / admin

    # ── 안전 교육 인증 ────────────────────────────────────────────────────────
    safety_certified = Column(Boolean, default=False)           # 인증 여부
    safety_certified_at = Column(DateTime, nullable=True)       # 최초/최신 인증 날짜
    safety_certified_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # 인증 부여 관리자 ID
    safety_reminder_sent_at = Column(DateTime, nullable=True)   # 최근 리마인드 발송 날짜

    created_at = Column(DateTime, default=datetime.utcnow)

    reservations = relationship("Reservation", back_populates="user")
    logs = relationship("UsageLog", back_populates="user")
    noshow_records = relationship("NoShowRecord", foreign_keys="NoShowRecord.user_id", back_populates="user")
    equipment_bans = relationship("EquipmentBan", foreign_keys="EquipmentBan.user_id", back_populates="user")


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
    checkin_time = Column(DateTime, nullable=True)           # 실제 체크인 시각
    checkout_time = Column(DateTime, nullable=True)          # 실제 체크아웃 시각
    early_checkout = Column(Boolean, default=False)          # 예정보다 일찍 종료 여부
    gcal_event_id = Column(String(255), nullable=True)       # Google Calendar 이벤트 ID
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


# ─── 노쇼(No-Show) 관련 ──────────────────────────────────────────────────────────

class NoShowRecord(Base):
    """노쇼 기록 테이블 — 사용자가 체크인 없이 예약 시간을 넘긴 경우"""
    __tablename__ = "noshow_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=False)
    reservation_id = Column(Integer, ForeignKey("reservations.id"), nullable=False, unique=True)
    # 해당 노쇼 발생 시점의 누적 스택 수 (1, 2, 3, 4, ...)
    stack_at_time = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id], back_populates="noshow_records")
    equipment = relationship("Equipment")
    reservation = relationship("Reservation")


class EquipmentBan(Base):
    """장비 사용 금지 테이블 — 노쇼 3회 누적 시 해당 장비 3일 사용 금지"""
    __tablename__ = "equipment_bans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=False)
    banned_from = Column(DateTime, nullable=False, default=datetime.utcnow)
    banned_until = Column(DateTime, nullable=False)     # banned_from + 3일
    reason = Column(Text, nullable=True)                # "노쇼 3회 누적"

    user = relationship("User", foreign_keys=[user_id], back_populates="equipment_bans")
    equipment = relationship("Equipment")


# ─── RAG 매뉴얼 챗봇 관련 ────────────────────────────────────────────────────────

class ManualDocument(Base):
    """장비 매뉴얼 PDF 문서 메타데이터 테이블"""
    __tablename__ = "manual_documents"

    id = Column(Integer, primary_key=True, index=True)
    equipment_name = Column(String(100), nullable=False, index=True)  # "SEM", "XRD", "TEM" 등
    title = Column(String(255), nullable=False)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    chunk_count = Column(Integer, default=0)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    chunks = relationship("ManualChunk", back_populates="document", cascade="all, delete-orphan")


class ManualChunk(Base):
    """매뉴얼 PDF 청크 테이블 — 벡터 검색용 텍스트 단위"""
    __tablename__ = "manual_chunks"

    id = Column(Integer, primary_key=True, index=True)
    manual_document_id = Column(Integer, ForeignKey("manual_documents.id"), nullable=False)
    equipment_name = Column(String(100), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)           # 문서 내 순서
    page_number = Column(Integer, nullable=True)            # PDF 페이지 번호
    content = Column(Text, nullable=False)                  # 청크 텍스트
    faiss_index_key = Column(Integer, nullable=True)        # FAISS 내 벡터 인덱스
    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("ManualDocument", back_populates="chunks")


class ManualQAHistory(Base):
    """매뉴얼 챗봇 질문/답변 이력 테이블"""
    __tablename__ = "manual_qa_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)   # 비로그인 허용
    equipment_name = Column(String(100), nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    sources_json = Column(Text, nullable=True)   # JSON: [{title, page, chunk_index}, ...]
    created_at = Column(DateTime, default=datetime.utcnow)
