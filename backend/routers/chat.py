"""
routers/chat.py — Claude API 기반 챗봇 엔드포인트
자연어로 장비 예약 요청을 처리하고 예약 API를 자동 호출합니다.
"""

import os
import json
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
import anthropic

import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import Reservation, Equipment, User, ReservationStatus, ChatRoom, ChatHistory

router = APIRouter(prefix="/chat", tags=["chat"])

# ─── Claude 클라이언트 초기화 ────────────────────────────────────────────────────
def get_claude_client():
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY가 설정되지 않았습니다.")
    return anthropic.Anthropic(api_key=api_key)


# ─── Pydantic 스키마 ────────────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str        # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    room_id: int                              # 채팅방 ID (필수)
    history: Optional[List[ChatMessage]] = [] # 프론트 캐시용 (미사용 시 DB에서 로드)


class ChatResponse(BaseModel):
    reply: str
    action: Optional[str] = None      # "reservation_created" | "reservation_list" | None
    data: Optional[dict] = None       # 예약 생성 시 반환 데이터


# ─── 시스템 프롬프트 ─────────────────────────────────────────────────────────────
def build_system_prompt(db: Session) -> str:
    # 현재 장비 목록을 DB에서 가져와 프롬프트에 포함
    equipments = db.query(Equipment).all()
    equipment_list = "\n".join(
        [f"  - ID:{e.id} | {e.name} | 위치:{e.location} | 상태:{e.status}"
         for e in equipments]
    ) if equipments else "  (등록된 장비 없음 — 테스트용: XRD(ID:1), SEM(ID:2), TEM(ID:3))"

    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    return f"""당신은 대학 연구실 장비 관리 플랫폼 'LabFlow'의 AI 예약 도우미입니다.
현재 시각: {now}

[사용 가능한 장비]
{equipment_list}

[역할]
- 사용자의 자연어 요청을 분석하여 장비 예약을 도와줍니다.
- 예약 생성, 예약 조회, 장비 상태 확인 등의 요청을 처리합니다.
- 예약에 필요한 정보(장비명, 날짜, 시간, 사용 목적)가 부족하면 친절하게 되물어봅니다.

[예약 생성 규칙]
- 필요 정보: 장비 ID, 사용자 ID(현재는 테스트용 1 사용), 시작시각, 종료시각, 사용 목적
- 시간 충돌이 있으면 대안 시간을 제안합니다.
- 날짜/시간은 항상 ISO 8601 형식(예: 2026-04-11T14:00:00)으로 변환합니다.

[응답 형식]
- 예약 생성이 확정되면 반드시 아래 JSON 블록을 응답 마지막에 포함하세요:
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
- 그 외 일반 대화는 자연스러운 한국어로 답변합니다.
- 항상 친절하고 간결하게 답변하세요."""


# ─── JSON 액션 파싱 ──────────────────────────────────────────────────────────────
def extract_json_action(text: str) -> Optional[dict]:
    """Claude 응답에서 JSON 블록 추출"""
    try:
        start = text.find("```json")
        end = text.find("```", start + 6)
        if start != -1 and end != -1:
            json_str = text[start + 7:end].strip()
            return json.loads(json_str)
    except Exception:
        pass
    return None


def clean_reply(text: str) -> str:
    """응답에서 JSON 블록 제거하고 사용자에게 보낼 텍스트만 반환"""
    start = text.find("```json")
    if start != -1:
        return text[:start].strip()
    return text.strip()


# ─── 메인 챗 엔드포인트 ──────────────────────────────────────────────────────────
@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest, db: Session = Depends(get_db)):
    client = get_claude_client()

    # 채팅방 확인
    room = db.query(ChatRoom).filter(ChatRoom.id == request.room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="채팅방을 찾을 수 없습니다.")

    # DB에서 대화 히스토리 로드 (최근 20개)
    db_history = db.query(ChatHistory)\
        .filter(ChatHistory.room_id == request.room_id)\
        .order_by(ChatHistory.created_at.asc())\
        .limit(20).all()

    messages = [
        {"role": h.role, "content": h.content}
        for h in db_history
    ]
    messages.append({"role": "user", "content": request.message})

    # 사용자 메시지 DB 저장
    db.add(ChatHistory(room_id=request.room_id, role="user", content=request.message))
    db.commit()

    # Claude API 호출
    response = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=1024,
        system=build_system_prompt(db),
        messages=messages,
    )

    reply_text = response.content[0].text

    # JSON 액션 파싱
    action_data = extract_json_action(reply_text)
    clean_text = clean_reply(reply_text)

    # 예약 생성 액션 처리
    if action_data and action_data.get("action") == "create_reservation":
        try:
            start_dt = datetime.fromisoformat(action_data["start_time"])
            end_dt = datetime.fromisoformat(action_data["end_time"])

            # 시간 충돌 확인
            conflict = db.query(Reservation).filter(
                Reservation.equipment_id == action_data["equipment_id"],
                Reservation.status != ReservationStatus.cancelled,
                Reservation.start_time < end_dt,
                Reservation.end_time > start_dt,
            ).first()

            if conflict:
                conflict_reply = clean_text + "\n\n⚠️ 해당 시간대에 이미 예약이 있습니다. 다른 시간을 선택해주세요."
                db.add(ChatHistory(room_id=request.room_id, role="assistant", content=conflict_reply))
                db.commit()
                return ChatResponse(reply=conflict_reply, action="conflict")

            # 예약 생성
            reservation = Reservation(
                equipment_id=action_data["equipment_id"],
                user_id=action_data.get("user_id", 1),
                start_time=start_dt,
                end_time=end_dt,
                purpose=action_data.get("purpose", ""),
                status=ReservationStatus.confirmed,
            )
            db.add(reservation)
            db.commit()
            db.refresh(reservation)

            success_reply = clean_text + f"\n\n✅ 예약이 완료됐습니다! (예약 ID: {reservation.id})"
            db.add(ChatHistory(room_id=request.room_id, role="assistant", content=success_reply))
            db.commit()
            return ChatResponse(
                reply=success_reply,
                action="reservation_created",
                data={"reservation_id": reservation.id}
            )

        except Exception as e:
            error_reply = clean_text + f"\n\n⚠️ 예약 처리 중 오류가 발생했습니다: {str(e)}"
            db.add(ChatHistory(room_id=request.room_id, role="assistant", content=error_reply))
            db.commit()
            return ChatResponse(reply=error_reply, action="error")

    # 일반 응답 DB 저장
    db.add(ChatHistory(room_id=request.room_id, role="assistant", content=clean_text))
    db.commit()
    return ChatResponse(reply=clean_text)
