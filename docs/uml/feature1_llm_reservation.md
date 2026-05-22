# 유스케이스 명세서 — 핵심 기능 1: 자연어 기반 장비 예약

> LabFlow 최종발표용 UML 작성 가이드 (2026 AI Capstone Design Project)

---

## 1. 유스케이스 개요

| 항목 | 내용 |
|------|------|
| **유스케이스명** | 자연어 기반 장비 예약 (LLM Chatbot Reservation) |
| **유스케이스 ID** | UC-01 |
| **주요 액터** | 연구자 (Researcher) |
| **보조 액터** | LLM Agent (Claude API), 예약 DB |
| **목적** | 연구자가 자연어로 장비 예약을 요청하면 AI가 가용 슬롯을 탐색하고 예약을 생성한다 |

---

## 2. 액터 (Actors)

- **연구자 (Primary Actor)**: 자연어로 예약 요청을 입력하는 사용자
- **LLM Agent**: Claude API를 통해 자연어를 분석하고 구조화된 액션을 생성
- **예약 DB**: SQLite/PostgreSQL — 기존 예약 충돌 확인 및 신규 예약 저장

---

## 3. 사전 조건 (Preconditions)

1. 연구자가 LabFlow에 로그인되어 있다.
2. 예약 챗봇 채팅방이 생성되어 있다 (room_id 존재).
3. 장비(Equipment) 레코드가 DB에 등록되어 있다.
4. ANTHROPIC_API_KEY 또는 LLM_MOCK_MODE=true가 설정되어 있다.

---

## 4. 정상 성공 시나리오 (Main Flow)

| 단계 | 액터 | 행동 |
|------|------|------|
| 1 | 연구자 | 채팅 입력창에 "이번 주 SEM 2시간 연속 슬롯 찾아줘" 입력 |
| 2 | 시스템 | 입력 메시지를 DB(ChatHistory)에 저장 |
| 3 | LLM Agent | 자연어를 분석하여 `suggest_slots` 액션 JSON 생성 (equipment_id, duration_hours, search_days) |
| 4 | 시스템 | `find_available_slots()` 함수로 향후 7일 내 가용 2시간 연속 슬롯 탐색 |
| 5 | 시스템 | 가용 슬롯 최대 3개를 연구자에게 제시 |
| 6 | 연구자 | 제시된 슬롯 중 하나를 선택 (버튼 클릭) |
| 7 | 시스템 | `POST /api/v1/chat/confirm-slot` 호출로 예약 생성 |
| 8 | 시스템 | Reservation 레코드를 DB에 저장 (status: confirmed) |
| 9 | 시스템 | "✅ 예약 완료" 메시지와 예약 ID 반환 |
| 10 | 연구자 | 캘린더 탭에서 예약 확인 |

---

## 5. 대안 흐름 (Alternative Flows)

### A1 — 정보 부족 시 재질문
- 4a. 장비명 또는 시간 정보가 불명확한 경우
- LLM이 "어떤 장비를 얼마나 사용하실 예정인가요?" 등 clarification 질문 반환
- 연구자가 추가 정보를 제공하면 3단계로 복귀

### A2 — 특정 날짜/시간 직접 지정
- 3a. "내일 오후 2시에 XRD 1시간 예약해줘" 형태의 명확한 요청
- LLM이 `create_reservation` 액션 JSON 생성 (start_time, end_time 포함)
- 충돌 없으면 즉시 예약 생성 (6단계 건너뜀)

### A3 — 슬롯 충돌
- 8a. 선택한 슬롯에 이미 다른 예약이 생성된 경우 (레이스 컨디션)
- "⚠️ 선택하신 시간대에 방금 다른 예약이 생성됐습니다" 메시지 반환
- 5단계로 복귀하여 다른 슬롯 선택

### A4 — 가용 슬롯 없음
- 4a. 해당 기간 내 연속 가용 슬롯이 없는 경우
- "이번 주 가용 슬롯이 없습니다. 다음 주를 확인할까요?" 반환
- 연구자가 탐색 기간 조정 요청

---

## 6. 사후 조건 (Postconditions)

- **성공**: Reservation 레코드가 DB에 confirmed 상태로 저장
- **실패**: 기존 예약에 변화 없음, 오류 메시지 반환

---

## 7. 액티비티 다이어그램 단계 목록

```
[시작]
  ↓
사용자 자연어 입력
  ↓
메시지 DB 저장 (ChatHistory)
  ↓
LLM 호출 (Claude API / Mock)
  ↓
액션 파싱 (suggest_slots / create_reservation / 일반응답)
  ↓
[suggest_slots?] ──Yes──> DB에서 가용 슬롯 탐색
     ↓                       ↓
    No               슬롯 목록 반환 → 사용자에게 표시
     ↓                       ↓
[create_reservation?]   사용자 슬롯 선택
     ↓Yes                    ↓
충돌 확인 <─────────────────
     ↓
[충돌?] ──Yes──> 충돌 메시지 반환
     ↓No
Reservation DB 저장
     ↓
예약 완료 메시지 반환
     ↓
[종료]
```

---

## 8. 클래스 다이어그램 구성 요소

### Classes

```
ChatRouter
  + chat(request: ChatRequest) : ChatResponse
  + confirm_slot(request: ConfirmSlotRequest) : ChatResponse
  - find_available_slots(equipment_id, duration_hours, search_days, db) : List[dict]
  - build_system_prompt(db) : str
  - extract_json_action(text) : dict
  - mock_chat_response(message, db) : dict

ChatRequest
  + message: str
  + room_id: int
  + history: List[ChatMessage]

ChatResponse
  + reply: str
  + action: str  // "suggest_slots" | "reservation_created" | "conflict"
  + data: dict
  + slots: List[SlotInfo]

SlotInfo
  + start_time: str
  + end_time: str
  + label: str

ConfirmSlotRequest
  + equipment_id: int
  + start_time: str
  + end_time: str
  + purpose: str
  + user_id: int
  + room_id: int

Reservation (DB Model)
  + id: int
  + equipment_id: int
  + user_id: int
  + start_time: DateTime
  + end_time: DateTime
  + purpose: str
  + status: ReservationStatus
  + created_at: DateTime

Equipment (DB Model)
  + id: int
  + name: str
  + location: str
  + status: str

ChatRoom (DB Model)
  + id: int
  + nickname: str
  + room_name: str

ChatHistory (DB Model)
  + id: int
  + room_id: int
  + role: str
  + content: str
  + created_at: DateTime
```

### 관계
- `ChatRouter` → uses → `Reservation`, `Equipment`, `ChatRoom`, `ChatHistory`
- `ChatRouter` → calls → `Claude API` (or Mock)
- `Reservation` → belongs to → `Equipment`
- `ChatHistory` → belongs to → `ChatRoom`

---

## 9. 시퀀스 다이어그램 객체/메시지 흐름

```
연구자        ChatBot.jsx      FastAPI(chat)    LLM(Claude)      DB
  │               │                │               │              │
  │──입력전송──>  │                │               │              │
  │               │──POST /chat/──>│               │              │
  │               │                │──save user msg────────────>  │
  │               │                │──LLM request──>              │
  │               │                │               │<──response── │
  │               │                │<──reply+action│              │
  │               │                │  (suggest_slots)             │
  │               │                │──find_slots──────────────>   │
  │               │                │<──slot list──────────────    │
  │               │                │──save assistant msg──────>   │
  │               │<──{reply,slots}│               │              │
  │<──슬롯버튼 표시│               │               │              │
  │               │               │               │              │
  │──슬롯 선택──> │               │               │              │
  │               │──POST /confirm-slot──>         │              │
  │               │                │──conflict check──────────>   │
  │               │                │<──no conflict────────────    │
  │               │                │──INSERT Reservation───────>  │
  │               │                │<──reservation_id─────────    │
  │               │                │──save success msg────────>   │
  │               │<──{reply: "예약완료"}          │              │
  │<──예약완료 표시│               │               │              │
```

---

## 10. 구현 파일 매핑

| UML 요소 | 실제 파일 |
|----------|-----------|
| ChatRouter | `backend/routers/chat.py` |
| find_available_slots | `backend/routers/chat.py:find_available_slots()` |
| LLM 호출 | `backend/routers/chat.py:chat()` |
| Mock 모드 | `backend/routers/chat.py:mock_chat_response()` |
| Reservation Model | `backend/models.py:Reservation` |
| ChatBot UI | `frontend/src/components/ChatBot.jsx` |
| 슬롯 선택 UI | `frontend/src/components/ChatBot.jsx:confirmSlot()` |
