"""
routers/chat.py -- Claude API 기반 챗봇 엔드포인트
자연어로 장비 예약 요청을 처리합니다.
LLM_MOCK_MODE=true 시 API Key 없이 데모 가능.
"""

import os
import json
import re
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session

import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import Reservation, Equipment, User, ReservationStatus, ChatRoom, ChatHistory

router = APIRouter(prefix="/chat", tags=["chat"])


def is_mock_mode() -> bool:
    return (
        os.getenv("LLM_MOCK_MODE", "false").lower() == "true"
        or not os.getenv("ANTHROPIC_API_KEY")
    )


def get_claude_client():
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY가 설정되지 않았습니다.")
    try:
        import anthropic
        return anthropic.Anthropic(api_key=api_key)
    except ImportError:
        raise HTTPException(status_code=500, detail="anthropic 패키지가 설치되지 않았습니다.")


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    room_id: int
    history: Optional[List[ChatMessage]] = []


class SlotInfo(BaseModel):
    start_time: str
    end_time: str
    label: str


class ChatResponse(BaseModel):
    reply: str
    action: Optional[str] = None
    data: Optional[dict] = None
    slots: Optional[List[SlotInfo]] = None


def find_available_slots(
    equipment_id: int,
    duration_hours: float,
    search_days: int,
    db: Session,
    max_slots: int = 3,
    work_start: int = 9,
    work_end: int = 18,
) -> List[dict]:
    now = datetime.now()
    start_day = now.replace(hour=work_start, minute=0, second=0, microsecond=0)
    if now.hour >= work_end:
        start_day += timedelta(days=1)

    period_end = start_day + timedelta(days=search_days)
    existing = db.query(Reservation).filter(
        Reservation.equipment_id == equipment_id,
        Reservation.status != ReservationStatus.cancelled,
        Reservation.start_time < period_end,
        Reservation.end_time > start_day,
    ).order_by(Reservation.start_time).all()

    slots = []
    step = timedelta(minutes=30)
    duration = timedelta(hours=duration_hours)
    cursor = max(start_day, now + timedelta(minutes=30))

    while cursor + duration <= period_end and len(slots) < max_slots:
        slot_end = cursor + duration
        if cursor.hour < work_start:
            cursor = cursor.replace(hour=work_start, minute=0, second=0)
            continue
        if slot_end.hour > work_end or (slot_end.hour == work_end and slot_end.minute > 0):
            cursor = (cursor + timedelta(days=1)).replace(hour=work_start, minute=0, second=0)
            continue
        if cursor.weekday() >= 5:
            cursor = (cursor + timedelta(days=1)).replace(hour=work_start, minute=0, second=0)
            continue

        conflict = any(
            r.start_time < slot_end and r.end_time > cursor
            for r in existing
        )
        if not conflict:
            weekday_map = ["월", "화", "수", "목", "금", "토", "일"]
            label = (
                f"{cursor.month}월 {cursor.day}일 ({weekday_map[cursor.weekday()]}) "
                f"{cursor.strftime('%H:%M')} ~ {slot_end.strftime('%H:%M')}"
            )
            slots.append({
                "start_time": cursor.isoformat(),
                "end_time": slot_end.isoformat(),
                "label": label,
            })
            cursor = slot_end
        else:
            cursor += step

    return slots


def build_system_prompt(db: Session) -> str:
    equipments = db.query(Equipment).all()
    equipment_list = "\n".join(
        [f"  - ID:{e.id} | {e.name} | {e.location} | {e.status}" for e in equipments]
    ) if equipments else "  - ID:1 | XRD\n  - ID:2 | SEM\n  - ID:3 | TEM"
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    return f"""당신은 LabFlow AI 예약 도우미입니다.
현재 시각: {now}

[장비 목록]
{equipment_list}

[응답 형식]
1. 가용 슬롯 탐색 요청 시:
```json
{{"action": "suggest_slots", "equipment_id": <int>, "duration_hours": <float>, "search_days": 7, "purpose": "<string>"}}
```
2. 특정 시각 직접 예약 시:
```json
{{"action": "create_reservation", "equipment_id": <int>, "user_id": 1, "start_time": "<ISO8601>", "end_time": "<ISO8601>", "purpose": "<string>"}}
```
3. 일반 질문: JSON 없이 한국어 답변.
항상 친절하고 간결하게 답변하세요."""


def extract_json_action(text: str) -> Optional[dict]:
    try:
        start = text.find("```json")
        end = text.find("```", start + 6)
        if start != -1 and end != -1:
            return json.loads(text[start + 7:end].strip())
    except Exception:
        pass
    return None


def clean_reply(text: str) -> str:
    start = text.find("```json")
    if start != -1:
        return text[:start].strip()
    return text.strip()


EQUIPMENT_MOCK_MAP = {
    "sem": (2, "SEM"), "xrd": (1, "XRD"), "tem": (3, "TEM"),
    "afm": (4, "AFM"), "ebeam": (5, "E-beam"), "이빔": (5, "E-beam"),
}


def mock_chat_response(message: str, db: Session) -> dict:
    msg_lower = message.lower()
    is_reservation = any(k in msg_lower for k in ["예약", "슬롯", "시간", "잡아", "찾아", "사용"])

    detected_equip = None
    detected_id = 2
    for key, (eid, ename) in EQUIPMENT_MOCK_MAP.items():
        if key in msg_lower:
            detected_equip = ename
            detected_id = eid
            break
    if not detected_equip:
        equip = db.query(Equipment).first()
        if equip:
            detected_equip = equip.name
            detected_id = equip.id
        else:
            detected_equip = "SEM"

    duration_match = re.search(r"(\d+)\s*시간", message)
    duration_hours = float(duration_match.group(1)) if duration_match else 2.0

    if is_reservation:
        slots = find_available_slots(detected_id, duration_hours, 7, db, max_slots=3)
        if slots:
            slot_lines = "\n".join([f"  {i+1}. {s['label']}" for i, s in enumerate(slots)])
            return {
                "reply": (
                    f"**{detected_equip}** 장비에서 **{duration_hours:.0f}시간** 연속 가용 슬롯을 찾았습니다!\n\n"
                    f"{slot_lines}\n\n원하시는 시간대를 선택해주세요."
                ),
                "action": "suggest_slots",
                "slots": slots,
                "data": {"equipment_id": detected_id, "equipment_name": detected_equip, "purpose": "연구 목적"},
            }
        else:
            return {
                "reply": f"이번 주 {detected_equip} 가용 슬롯을 찾지 못했습니다. 다음 주를 확인해드릴까요?",
                "action": None, "slots": None, "data": None,
            }

    return {
        "reply": (
            "안녕하세요! LabFlow AI 예약 도우미입니다.\n\n"
            "예시:\n• '이번 주 SEM 2시간 연속 슬롯 찾아줘'\n• '내일 오후 2시에 XRD 1시간 예약해줘'"
        ),
        "action": None, "slots": None, "data": None,
    }


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest, db: Session = Depends(get_db)):
    room = db.query(ChatRoom).filter(ChatRoom.id == request.room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="채팅방을 찾을 수 없습니다.")

    db.add(ChatHistory(room_id=request.room_id, role="user", content=request.message))
    db.commit()

    if is_mock_mode():
        mock = mock_chat_response(request.message, db)
        db.add(ChatHistory(room_id=request.room_id, role="assistant", content=mock["reply"]))
        db.commit()
        return ChatResponse(
            reply=mock["reply"],
            action=mock.get("action"),
            data=mock.get("data"),
            slots=[SlotInfo(**s) for s in mock["slots"]] if mock.get("slots") else None,
        )

    client = get_claude_client()
    db_history = db.query(ChatHistory)\
        .filter(ChatHistory.room_id == request.room_id)\
        .order_by(ChatHistory.created_at.asc()).limit(20).all()
    messages = [{"role": h.role, "content": h.content} for h in db_history]
    messages.append({"role": "user", "content": request.message})

    response = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=1024,
        system=build_system_prompt(db),
        messages=messages,
    )

    reply_text = response.content[0].text
    action_data = extract_json_action(reply_text)
    clean_text = clean_reply(reply_text)

    if action_data and action_data.get("action") == "suggest_slots":
        equip_id = action_data.get("equipment_id", 1)
        duration = action_data.get("duration_hours", 2.0)
        slots = find_available_slots(equip_id, duration, action_data.get("search_days", 7), db)
        equip = db.query(Equipment).filter(Equipment.id == equip_id).first()
        equip_name = equip.name if equip else f"장비#{equip_id}"
        if slots:
            slot_lines = "\n".join([f"  {i+1}. {s['label']}" for i, s in enumerate(slots)])
            slot_reply = f"{clean_text}\n\n**{equip_name}** 가용 슬롯 {len(slots)}개:\n{slot_lines}\n\n원하시는 시간대를 선택해주세요."
        else:
            slot_reply = clean_text + "\n\n해당 기간 내 가용 슬롯이 없습니다."
            slots = []
        db.add(ChatHistory(room_id=request.room_id, role="assistant", content=slot_reply))
        db.commit()
        return ChatResponse(
            reply=slot_reply, action="suggest_slots",
            data={"equipment_id": equip_id, "purpose": action_data.get("purpose", "")},
            slots=[SlotInfo(**s) for s in slots],
        )

    if action_data and action_data.get("action") == "create_reservation":
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
                r = clean_text + "\n\n해당 시간대에 이미 예약이 있습니다."
                db.add(ChatHistory(room_id=request.room_id, role="assistant", content=r))
                db.commit()
                return ChatResponse(reply=r, action="conflict")
            reservation = Reservation(
                equipment_id=action_data["equipment_id"],
                user_id=action_data.get("user_id", 1),
                start_time=start_dt, end_time=end_dt,
                purpose=action_data.get("purpose", ""),
                status=ReservationStatus.confirmed,
            )
            db.add(reservation)
            db.commit()
            db.refresh(reservation)
            r = clean_text + f"\n\n예약 완료! (ID: {reservation.id})"
            db.add(ChatHistory(room_id=request.room_id, role="assistant", content=r))
            db.commit()
            return ChatResponse(reply=r, action="reservation_created", data={"reservation_id": reservation.id})
        except Exception as e:
            r = clean_text + f"\n\n예약 오류: {str(e)}"
            db.add(ChatHistory(room_id=request.room_id, role="assistant", content=r))
            db.commit()
            return ChatResponse(reply=r, action="error")

    db.add(ChatHistory(room_id=request.room_id, role="assistant", content=clean_text))
    db.commit()
    return ChatResponse(reply=clean_text)


class ConfirmSlotRequest(BaseModel):
    equipment_id: int
    start_time: str
    end_time: str
    purpose: Optional[str] = "연구 목적"
    user_id: Optional[int] = 1
    room_id: int


@router.post("/confirm-slot", response_model=ChatResponse)
async def confirm_slot(request: ConfirmSlotRequest, db: Session = Depends(get_db)):
    try:
        start_dt = datetime.fromisoformat(request.start_time)
        end_dt = datetime.fromisoformat(request.end_time)

        conflict = db.query(Reservation).filter(
            Reservation.equipment_id == request.equipment_id,
            Reservation.status != ReservationStatus.cancelled,
            Reservation.start_time < end_dt,
            Reservation.end_time > start_dt,
        ).first()

        if conflict:
            reply = "선택하신 시간대에 방금 다른 예약이 생성됐습니다. 다른 슬롯을 선택해주세요."
            db.add(ChatHistory(room_id=request.room_id, role="assistant", content=reply))
            db.commit()
            return ChatResponse(reply=reply, action="conflict")

        reservation = Reservation(
            equipment_id=request.equipment_id,
            user_id=request.user_id,
            start_time=start_dt, end_time=end_dt,
            purpose=request.purpose,
            status=ReservationStatus.confirmed,
        )
        db.add(reservation)
        db.commit()
        db.refresh(reservation)

        equip = db.query(Equipment).filter(Equipment.id == request.equipment_id).first()
        equip_name = equip.name if equip else f"장비#{request.equipment_id}"
        weekday_map = ["월", "화", "수", "목", "금", "토", "일"]
        time_label = (
            f"{start_dt.month}월 {start_dt.day}일 ({weekday_map[start_dt.weekday()]}) "
            f"{start_dt.strftime('%H:%M')} ~ {end_dt.strftime('%H:%M')}"
        )
        reply = (
            f"**{equip_name}** 예약이 완료됐습니다!\n\n"
            f"일시: {time_label}\n목적: {request.purpose}\n예약 ID: #{reservation.id}\n\n"
            "캘린더 탭에서 예약을 확인하실 수 있습니다."
        )
        db.add(ChatHistory(room_id=request.room_id, role="assistant", content=reply))
        db.commit()
        return ChatResponse(reply=reply, action="reservation_created",
                            data={"reservation_id": reservation.id, "equipment_name": equip_name})

    except Exception as e:
        return ChatResponse(reply=f"예약 확정 오류: {str(e)}", action="error")
