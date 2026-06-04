"""
Chat endpoint for LabFlow reservations.

Claude is used when ANTHROPIC_API_KEY is configured. Without a key, the route
falls back to a small local assistant so the UI does not show a server error.
"""

import json
import os
import re
import sys
from datetime import datetime, timedelta
from typing import List, Optional

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import ChatHistory, ChatRoom, Equipment, Reservation, ReservationStatus, User
from routers.reservation import (
    _reservation_status_text,
    _sync_to_gcal_create,
    _sync_to_gcal_delete,
    _sync_to_gcal_update,
)


router = APIRouter(prefix="/chat", tags=["chat"])

EQUIPMENT_ALIASES = [
    (1, ["xrd", "엑스알디", "x-ray", "x ray"]),
    (2, ["sem", "에스이엠", "전자현미경"]),
    (3, ["e-beam", "ebeam", "e beam", "이빔", "tem"]),
    (4, ["afm", "에이에프엠"]),
    (5, ["furnace #1", "furnace 1", "전기로 1", "전기로1", "퍼니스 1"]),
    (6, ["furnace #2", "furnace 2", "전기로 2", "전기로2", "퍼니스 2"]),
    (7, ["furnace #3", "furnace 3", "전기로 3", "전기로3", "퍼니스 3"]),
    (8, ["furnace #4", "furnace 4", "전기로 4", "전기로4", "퍼니스 4"]),
]


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    room_id: int
    history: Optional[List[ChatMessage]] = []
    user_id: Optional[int] = None


class ChatResponse(BaseModel):
    reply: str
    action: Optional[str] = None
    data: Optional[dict] = None


def get_claude_client():
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    return anthropic.Anthropic(api_key=api_key)


def build_system_prompt(db: Session) -> str:
    equipments = db.query(Equipment).all()
    equipment_list = "\n".join(
        f"  - ID:{e.id} | {e.name} | 위치:{e.location} | 상태:{e.status}"
        for e in equipments
    ) if equipments else "  (등록된 장비 없음. 테스트용: XRD(ID:1), SEM(ID:2), TEM(ID:3))"

    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    return f"""당신은 대학 연구실 장비 관리 플랫폼 'LabFlow'의 AI 예약 도우미입니다.
현재 시각: {now}

[사용 가능한 장비]
{equipment_list}

[역할]
- 사용자의 자연어 요청을 분석하여 장비 예약을 도와줍니다.
- 예약 생성, 예약 조회, 예약 수정, 예약 취소, 장비 상태 확인 요청을 처리합니다.
- 예약에 필요한 정보(장비명, 날짜, 시간, 사용 목적)가 부족하면 친절하게 되묻습니다.

[예약 생성 규칙]
- 필요 정보: 장비 ID, 사용자 ID(현재는 테스트용 1 사용), 시작시각, 종료시각, 사용 목적
- 시간 충돌이 있으면 다른 시간을 제안합니다.
- 날짜/시간은 항상 ISO 8601 형식(예: 2026-04-11T14:00:00)으로 변환합니다.

[응답 형식]
- 예약 액션이 확정되면 반드시 아래 JSON 블록 중 하나를 응답 마지막에 포함하세요.

예약 생성:
```json
{{
  "action": "create_reservation",
  "equipment_id": <int>,
  "user_id": 1,
  "start_time": "<ISO8601>",
  "end_time": "<ISO8601>",
  "purpose": "<string>"
}}
```

예약 조회:
```json
{{
  "action": "list_reservations",
  "user_id": 1
}}
```

예약 취소:
```json
{{
  "action": "cancel_reservation",
  "reservation_id": <int>
}}
```

예약 수정:
```json
{{
  "action": "update_reservation",
  "reservation_id": <int>,
  "equipment_id": <int>,
  "start_time": "<ISO8601>",
  "end_time": "<ISO8601>",
  "purpose": "<string>"
}}
```
- 그 외 일반 대화는 자연스러운 한국어로 답합니다.
- 항상 친절하고 간결하게 답하세요."""


def extract_json_action(text: str) -> Optional[dict]:
    try:
        start = text.find("```json")
        end = text.find("```", start + 7)
        if start != -1 and end != -1:
            json_str = text[start + 7:end].strip()
            return json.loads(json_str)
    except Exception:
        pass
    return None


def clean_reply(text: str) -> str:
    start = text.find("```json")
    if start != -1:
        return text[:start].strip()
    return text.strip()


def equipment_summary(db: Session) -> str:
    equipments = db.query(Equipment).all()
    if equipments:
        return "\n".join(f"- {e.name} (ID:{e.id}) 상태: {e.status}" for e in equipments)
    return "- XRD (ID:1)\n- SEM (ID:2)\n- E-beam (ID:3)\n- AFM (ID:4)\n- Furnace #1~#4 (ID:5~8)"


def manual_question_requested(message: str) -> bool:
    text = message.lower()
    manual_terms = [
        "매뉴얼",
        "사용법",
        "사용 방법",
        "작동법",
        "작동 방법",
        "시료 준비",
        "진공",
        "펌프",
        "켜는 순서",
        "주의사항",
        "세팅",
    ]
    return any(term in text for term in manual_terms)


def build_manual_demo_reply(message: str) -> str:
    equipment_id = find_equipment_id(message)
    equipment_label = {
        1: "XRD",
        2: "SEM",
        3: "E-beam/TEM",
        4: "AFM",
        5: "Furnace #1",
        6: "Furnace #2",
        7: "Furnace #3",
        8: "Furnace #4",
    }.get(equipment_id, "장비")

    # TODO: 실제 매뉴얼 문서 검색은 추후 /manual-chat/ 또는 RAG 엔드포인트로 연결합니다.
    return (
        f"[매뉴얼 데모 응답] {equipment_label} 관련 질문을 확인했습니다.\n\n"
        "현재 Command Center는 예약 챗봇 API에 매뉴얼 데모 응답만 연결된 상태입니다. "
        "실제 구현 시 FAISS/RAG 매뉴얼 검색 결과로 답변을 생성할 예정입니다.\n\n"
        f"질문: {message.strip()}"
    )


def build_local_reply(message: str, db: Session, ai_error: bool = False) -> str:
    text = message.strip().lower()
    prefix = ""
    if ai_error:
        prefix = "AI 연결이 잠시 불안정해서 기본 안내 모드로 답변할게요.\n\n"

    if any(word in text for word in ["안녕", "hello", "hi", "하이"]):
        return (
            prefix
            + "안녕하세요! LabFlow 예약 도우미입니다.\n"
            + "장비 현황 확인이나 예약 요청을 도와드릴 수 있어요.\n"
            + "예: '내일 오후 2시에 XRD 2시간 예약하고 싶어'"
        )

    if any(word in text for word in ["장비", "현황", "목록", "사용 가능"]):
        return prefix + "현재 확인 가능한 장비는 아래와 같습니다.\n" + equipment_summary(db)

    if manual_question_requested(message):
        return prefix + build_manual_demo_reply(message)

    if "예약" in text:
        return (
            prefix
            + "예약을 진행하려면 장비명, 날짜, 시작 시간, 사용 시간을 알려주세요.\n"
            + "예: '내일 오후 2시에 XRD 2시간 예약, 목적은 시료 분석'"
        )

    return (
        prefix
        + "말씀하신 내용을 확인했어요. 장비 예약, 장비 현황, 사용 방법 중 어떤 도움이 필요하신지 알려주세요."
    )


def find_equipment_id(message: str) -> Optional[int]:
    text = message.lower()
    for equipment_id, aliases in EQUIPMENT_ALIASES:
        if any(alias in text for alias in aliases):
            return equipment_id
    return None


def parse_start_date(message: str) -> Optional[datetime.date]:
    now = datetime.now()
    text = message.lower()

    if "모레" in text:
        return (now + timedelta(days=2)).date()
    if "내일" in text:
        return (now + timedelta(days=1)).date()
    if "오늘" in text:
        return now.date()

    iso_match = re.search(r"(20\d{2})[-./](\d{1,2})[-./](\d{1,2})", text)
    if iso_match:
        year, month, day = map(int, iso_match.groups())
        return datetime(year, month, day).date()

    korean_match = re.search(r"(?:(20\d{2})년\s*)?(\d{1,2})월\s*(\d{1,2})일", text)
    if korean_match:
        year = int(korean_match.group(1) or now.year)
        month = int(korean_match.group(2))
        day = int(korean_match.group(3))
        return datetime(year, month, day).date()

    return None


def parse_start_time(message: str) -> Optional[tuple[int, int]]:
    text = message.lower()

    meridiem_match = re.search(r"(오전|오후)\s*(\d{1,2})\s*시?(?:\s*(\d{1,2})\s*분)?", text)
    if meridiem_match:
        meridiem, hour_text, minute_text = meridiem_match.groups()
        hour = int(hour_text)
        minute = int(minute_text or 0)
        if meridiem == "오후" and hour < 12:
            hour += 12
        if meridiem == "오전" and hour == 12:
            hour = 0
        return hour, minute

    clock_match = re.search(r"(\d{1,2}):(\d{2})", text)
    if clock_match:
        hour, minute = map(int, clock_match.groups())
        return hour, minute

    hour_match = re.search(r"(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?", text)
    if hour_match:
        hour = int(hour_match.group(1))
        minute = int(hour_match.group(2) or 0)
        return hour, minute

    return None


def parse_duration(message: str) -> Optional[timedelta]:
    text = message.lower()

    hour_match = re.search(r"(\d+(?:\.\d+)?)\s*시간", text)
    minute_match = re.search(r"(\d+)\s*분", text)

    hours = float(hour_match.group(1)) if hour_match else 0
    minutes = int(minute_match.group(1)) if minute_match else 0

    if hours or minutes:
        return timedelta(hours=hours, minutes=minutes)
    return None


def parse_purpose(message: str) -> str:
    match = re.search(r"목적(?:은|은요|:|는)?\s*['\"]?([^'\".,\n]+)", message)
    if match:
        return match.group(1).strip()

    if "시료 분석" in message:
        return "시료 분석"
    return "장비 사용"


def resolve_user_id(request: ChatRequest, room: ChatRoom, db: Session, action_data: Optional[dict] = None) -> int:
    if request.user_id:
        return request.user_id
    if action_data and action_data.get("user_id"):
        return int(action_data["user_id"])

    user = db.query(User).filter(User.name == room.nickname).order_by(User.id.desc()).first()
    return user.id if user else 1


def equipment_name(db: Session, equipment_id: int) -> str:
    equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    return equipment.name if equipment else f"Equipment #{equipment_id}"


def format_reservation_line(reservation: Reservation, db: Session) -> str:
    equip_name = reservation.equipment.name if reservation.equipment else equipment_name(db, reservation.equipment_id)
    purpose = reservation.purpose or "-"
    return (
        f"- ID {reservation.id} | {equip_name} | "
        f"{reservation.start_time.strftime('%Y-%m-%d %H:%M')}~{reservation.end_time.strftime('%H:%M')} | "
        f"상태: {reservation.status.value} | 목적: {purpose}"
    )


def format_reservation_detail(reservation: Reservation, db: Session) -> str:
    return format_reservation_line(reservation, db).lstrip("- ")


def extract_reservation_id(message: str) -> Optional[int]:
    patterns = [
        r"(?:예약\s*)?#?\s*(\d+)\s*번",
        r"reservation\s*#?\s*(\d+)",
        r"#\s*(\d+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, message, re.IGNORECASE)
        if match:
            return int(match.group(1))
    return None


def local_list_requested(message: str) -> bool:
    text = message.lower()
    return any(phrase in text for phrase in ["내 예약", "예약 조회", "예약 목록", "예약 보여", "예약 알려"])


def local_cancel_requested(message: str) -> bool:
    text = message.lower()
    return any(word in text for word in ["취소", "삭제", "예약 취소"])


def local_update_requested(message: str) -> bool:
    text = message.lower()
    return any(word in text for word in ["변경", "수정", "바꿔", "옮겨"])


def local_update_action(message: str) -> tuple[Optional[dict], list[str]]:
    reservation_id = extract_reservation_id(message)
    start_date = parse_start_date(message)
    start_time = parse_start_time(message)
    duration = parse_duration(message)
    equipment_id = find_equipment_id(message)

    missing = []
    if not reservation_id:
        missing.append("예약 ID")
    if (start_date and not start_time) or (start_time and not start_date):
        missing.append("날짜와 시작 시간")

    if missing:
        return None, missing

    action_data = {
        "action": "update_reservation",
        "reservation_id": reservation_id,
    }
    if equipment_id:
        action_data["equipment_id"] = equipment_id
    if start_date and start_time:
        hour, minute = start_time
        start_dt = datetime.combine(start_date, datetime.min.time()).replace(hour=hour, minute=minute)
        action_data["start_time"] = start_dt.isoformat()
        if duration:
            action_data["end_time"] = (start_dt + duration).isoformat()
    purpose = parse_purpose(message)
    if purpose != "장비 사용":
        action_data["purpose"] = purpose

    if len(action_data) == 2:
        return None, ["변경할 시간, 장비 또는 목적"]
    return action_data, []


def local_reservation_action(
    message: str,
    room: ChatRoom,
    db: Session,
    user_id: Optional[int] = None,
) -> tuple[Optional[dict], list[str]]:
    equipment_id = find_equipment_id(message)
    start_date = parse_start_date(message)
    start_time = parse_start_time(message)
    duration = parse_duration(message)

    missing = []
    if not equipment_id:
        missing.append("장비명")
    if not start_date:
        missing.append("날짜")
    if not start_time:
        missing.append("시작 시간")
    if not duration:
        missing.append("사용 시간")

    if missing:
        return None, missing

    if user_id is None:
        user = db.query(User).filter(User.name == room.nickname).order_by(User.id.desc()).first()
        user_id = user.id if user else 1
    hour, minute = start_time
    start_dt = datetime.combine(start_date, datetime.min.time()).replace(hour=hour, minute=minute)
    end_dt = start_dt + duration

    return {
        "action": "create_reservation",
        "equipment_id": equipment_id,
        "user_id": user_id,
        "start_time": start_dt.isoformat(),
        "end_time": end_dt.isoformat(),
        "purpose": parse_purpose(message),
    }, []


def save_assistant_reply(db: Session, room_id: int, reply: str):
    db.add(ChatHistory(room_id=room_id, role="assistant", content=reply))
    db.commit()


def handle_reservation_action(action_data: dict, clean_text: str, request: ChatRequest, db: Session) -> ChatResponse:
    try:
        start_dt = datetime.fromisoformat(action_data["start_time"])
        end_dt = datetime.fromisoformat(action_data["end_time"])

        conflict = db.query(Reservation).filter(
            Reservation.equipment_id == action_data["equipment_id"],
            Reservation.status != ReservationStatus.cancelled,
            Reservation.start_time < end_dt,
            Reservation.end_time > start_dt,
        ).first()

        if conflict:
            reply = clean_text + "\n\n해당 시간에는 이미 예약이 있습니다. 다른 시간을 선택해주세요."
            save_assistant_reply(db, request.room_id, reply)
            return ChatResponse(reply=reply, action="conflict")

        reservation = Reservation(
            equipment_id=action_data["equipment_id"],
            user_id=request.user_id or action_data.get("user_id", 1),
            start_time=start_dt,
            end_time=end_dt,
            purpose=action_data.get("purpose", ""),
            status=ReservationStatus.confirmed,
        )
        db.add(reservation)
        db.commit()
        db.refresh(reservation)
        _sync_to_gcal_create(reservation, db)

        reply = (
            (clean_text + "\n\n" if clean_text else "")
            + "예약이 완료됐습니다.\n"
            + format_reservation_detail(reservation, db)
        )
        save_assistant_reply(db, request.room_id, reply)
        return ChatResponse(
            reply=reply,
            action="reservation_created",
            data={"reservation_id": reservation.id},
        )
    except Exception as exc:
        reply = clean_text + f"\n\n예약 처리 중 오류가 발생했습니다: {exc}"
        save_assistant_reply(db, request.room_id, reply)
        return ChatResponse(reply=reply, action="error")


def handle_list_reservations_action(
    action_data: dict,
    clean_text: str,
    request: ChatRequest,
    room: ChatRoom,
    db: Session,
) -> ChatResponse:
    user_id = resolve_user_id(request, room, db, action_data)
    reservations = (
        db.query(Reservation)
        .filter(Reservation.user_id == user_id)
        .order_by(Reservation.start_time.desc())
        .limit(10)
        .all()
    )

    if reservations:
        lines = "\n".join(format_reservation_line(reservation, db) for reservation in reservations)
        reply = (clean_text + "\n\n" if clean_text else "") + "최근 예약 목록입니다.\n" + lines
    else:
        reply = (clean_text + "\n\n" if clean_text else "") + "현재 확인되는 예약이 없습니다."

    save_assistant_reply(db, request.room_id, reply)
    return ChatResponse(
        reply=reply,
        action="reservations_listed",
        data={"user_id": user_id, "count": len(reservations)},
    )


def handle_cancel_reservation_action(
    action_data: dict,
    clean_text: str,
    request: ChatRequest,
    db: Session,
) -> ChatResponse:
    reservation_id = action_data.get("reservation_id")
    if not reservation_id:
        reply = "취소할 예약 ID를 알려주세요. 예: '예약 12번 취소해줘'"
        save_assistant_reply(db, request.room_id, reply)
        return ChatResponse(reply=reply, action="missing_reservation_id")

    reservation = db.query(Reservation).filter(Reservation.id == int(reservation_id)).first()
    if not reservation:
        reply = f"예약 ID {reservation_id}번을 찾을 수 없습니다."
        save_assistant_reply(db, request.room_id, reply)
        return ChatResponse(reply=reply, action="reservation_not_found")

    if request.user_id and reservation.user_id != request.user_id:
        reply = "다른 사용자의 예약은 취소할 수 없습니다."
        save_assistant_reply(db, request.room_id, reply)
        return ChatResponse(reply=reply, action="forbidden")

    reservation.status = ReservationStatus.cancelled
    db.commit()
    db.refresh(reservation)
    _sync_to_gcal_update(reservation, db, _reservation_status_text(ReservationStatus.cancelled))
    _sync_to_gcal_delete(reservation, db)
    db.refresh(reservation)

    reply = (
        (clean_text + "\n\n" if clean_text else "")
        + "예약을 취소했습니다.\n"
        + format_reservation_detail(reservation, db)
    )
    save_assistant_reply(db, request.room_id, reply)
    return ChatResponse(
        reply=reply,
        action="reservation_cancelled",
        data={"reservation_id": reservation.id},
    )


def handle_update_reservation_action(
    action_data: dict,
    clean_text: str,
    request: ChatRequest,
    db: Session,
) -> ChatResponse:
    reservation_id = action_data.get("reservation_id")
    if not reservation_id:
        reply = "수정할 예약 ID를 알려주세요. 예: '예약 12번 내일 오후 4시로 바꿔줘'"
        save_assistant_reply(db, request.room_id, reply)
        return ChatResponse(reply=reply, action="missing_reservation_id")

    reservation = db.query(Reservation).filter(Reservation.id == int(reservation_id)).first()
    if not reservation:
        reply = f"예약 ID {reservation_id}번을 찾을 수 없습니다."
        save_assistant_reply(db, request.room_id, reply)
        return ChatResponse(reply=reply, action="reservation_not_found")

    if request.user_id and reservation.user_id != request.user_id:
        reply = "다른 사용자의 예약은 수정할 수 없습니다."
        save_assistant_reply(db, request.room_id, reply)
        return ChatResponse(reply=reply, action="forbidden")

    update_fields = {
        key: value
        for key, value in action_data.items()
        if key in {"equipment_id", "start_time", "end_time", "purpose", "status"} and value is not None
    }
    if not update_fields:
        reply = "변경할 시간, 장비 또는 목적을 알려주세요."
        save_assistant_reply(db, request.room_id, reply)
        return ChatResponse(reply=reply, action="missing_update_fields")

    original_duration = reservation.end_time - reservation.start_time
    new_equipment_id = int(update_fields.get("equipment_id", reservation.equipment_id))
    try:
        new_start = (
            datetime.fromisoformat(update_fields["start_time"])
            if "start_time" in update_fields
            else reservation.start_time
        )
        if "end_time" in update_fields:
            new_end = datetime.fromisoformat(update_fields["end_time"])
        elif "start_time" in update_fields:
            new_end = new_start + original_duration
        else:
            new_end = reservation.end_time
        new_status = (
            ReservationStatus(update_fields["status"])
            if "status" in update_fields
            else reservation.status
        )
    except ValueError:
        reply = "날짜/시간 또는 예약 상태 형식을 확인해주세요."
        save_assistant_reply(db, request.room_id, reply)
        return ChatResponse(reply=reply, action="invalid_update_format")

    if new_end <= new_start:
        reply = "종료 시간은 시작 시간보다 뒤여야 합니다."
        save_assistant_reply(db, request.room_id, reply)
        return ChatResponse(reply=reply, action="invalid_time")

    if "equipment_id" in update_fields:
        equipment = db.query(Equipment).filter(Equipment.id == new_equipment_id).first()
        if not equipment:
            reply = f"장비 ID {new_equipment_id}번을 찾을 수 없습니다."
            save_assistant_reply(db, request.room_id, reply)
            return ChatResponse(reply=reply, action="equipment_not_found")

    schedule_changed = any(field in update_fields for field in ("equipment_id", "start_time", "end_time"))
    if schedule_changed and new_status != ReservationStatus.cancelled:
        conflict = db.query(Reservation).filter(
            Reservation.id != reservation.id,
            Reservation.equipment_id == new_equipment_id,
            Reservation.status != ReservationStatus.cancelled,
            Reservation.start_time < new_end,
            Reservation.end_time > new_start,
        ).first()
        if conflict:
            reply = "해당 시간에는 이미 예약이 있습니다. 다른 시간을 선택해주세요."
            save_assistant_reply(db, request.room_id, reply)
            return ChatResponse(reply=reply, action="conflict")

    reservation.equipment_id = new_equipment_id
    reservation.start_time = new_start
    reservation.end_time = new_end
    if "purpose" in update_fields:
        reservation.purpose = update_fields["purpose"]
    reservation.status = new_status

    db.commit()
    db.refresh(reservation)

    if reservation.status == ReservationStatus.cancelled:
        _sync_to_gcal_update(reservation, db, _reservation_status_text(reservation.status))
        _sync_to_gcal_delete(reservation, db)
    else:
        _sync_to_gcal_update(reservation, db, _reservation_status_text(reservation.status))
    db.refresh(reservation)

    reply = (
        (clean_text + "\n\n" if clean_text else "")
        + "예약을 수정했습니다.\n"
        + format_reservation_detail(reservation, db)
    )
    save_assistant_reply(db, request.room_id, reply)
    return ChatResponse(
        reply=reply,
        action="reservation_updated",
        data={"reservation_id": reservation.id},
    )


def handle_local_request(request: ChatRequest, room: ChatRoom, db: Session, ai_error: bool = False) -> ChatResponse:
    if manual_question_requested(request.message):
        reply = build_manual_demo_reply(request.message)
        if ai_error:
            reply = "AI 연결이 잠시 불안정해서 기본 안내 모드로 답변할게요.\n\n" + reply
        save_assistant_reply(db, request.room_id, reply)
        return ChatResponse(reply=reply, action="manual_demo")

    if local_list_requested(request.message):
        return handle_list_reservations_action(
            {"action": "list_reservations"},
            "",
            request,
            room,
            db,
        )

    if local_cancel_requested(request.message):
        reservation_id = extract_reservation_id(request.message)
        if not reservation_id:
            reply = "취소할 예약 ID를 알려주세요. 예: '예약 12번 취소해줘'"
            save_assistant_reply(db, request.room_id, reply)
            return ChatResponse(reply=reply, action="missing_reservation_id")
        return handle_cancel_reservation_action(
            {"action": "cancel_reservation", "reservation_id": reservation_id},
            "",
            request,
            db,
        )

    if local_update_requested(request.message):
        action_data, missing = local_update_action(request.message)
        if action_data:
            return handle_update_reservation_action(action_data, "", request, db)

        reply = (
            "예약을 수정하려면 "
            + ", ".join(missing)
            + " 정보를 더 알려주세요.\n"
            + "예: '예약 12번 내일 오후 4시로 바꿔줘'"
        )
        save_assistant_reply(db, request.room_id, reply)
        return ChatResponse(reply=reply, action="missing_update_fields")

    if "예약" in request.message:
        action_data, missing = local_reservation_action(
            request.message,
            room,
            db,
            user_id=request.user_id,
        )
        if action_data:
            start_dt = datetime.fromisoformat(action_data["start_time"])
            end_dt = datetime.fromisoformat(action_data["end_time"])
            clean_text = (
                f"{start_dt.strftime('%Y-%m-%d %H:%M')}부터 "
                f"{end_dt.strftime('%H:%M')}까지 예약을 진행할게요."
            )
            return handle_reservation_action(action_data, clean_text, request, db)

        reply = (
            "예약을 진행하려면 "
            + ", ".join(missing)
            + " 정보를 더 알려주세요.\n"
            + "예: '내일 오후 2시에 XRD 2시간 예약, 목적은 시료 분석'"
        )
    else:
        reply = build_local_reply(request.message, db, ai_error=ai_error)

    save_assistant_reply(db, request.room_id, reply)
    return ChatResponse(reply=reply, action="local_fallback")


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest, db: Session = Depends(get_db)):
    room = db.query(ChatRoom).filter(ChatRoom.id == request.room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="채팅방을 찾을 수 없습니다.")

    db_history = (
        db.query(ChatHistory)
        .filter(ChatHistory.room_id == request.room_id)
        .order_by(ChatHistory.created_at.asc())
        .limit(20)
        .all()
    )

    messages = [{"role": h.role, "content": h.content} for h in db_history]
    messages.append({"role": "user", "content": request.message})

    db.add(ChatHistory(room_id=request.room_id, role="user", content=request.message))
    db.commit()

    if manual_question_requested(request.message):
        reply = build_manual_demo_reply(request.message)
        save_assistant_reply(db, request.room_id, reply)
        return ChatResponse(reply=reply, action="manual_demo")

    client = get_claude_client()
    if not client:
        return handle_local_request(request, room, db)

    try:
        response = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=1024,
            system=build_system_prompt(db),
            messages=messages,
        )
        reply_text = response.content[0].text
    except Exception:
        return handle_local_request(request, room, db, ai_error=True)

    action_data = extract_json_action(reply_text)
    clean_text = clean_reply(reply_text)

    if action_data:
        action = action_data.get("action")
        if action == "create_reservation":
            return handle_reservation_action(action_data, clean_text, request, db)
        if action == "list_reservations":
            return handle_list_reservations_action(action_data, clean_text, request, room, db)
        if action == "cancel_reservation":
            return handle_cancel_reservation_action(action_data, clean_text, request, db)
        if action == "update_reservation":
            return handle_update_reservation_action(action_data, clean_text, request, db)

    save_assistant_reply(db, request.room_id, clean_text)
    return ChatResponse(reply=clean_text)
