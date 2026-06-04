# LabFlow Command Center 리팩터링 계획

이 문서는 gijun 브랜치에서 현재 사용자 피드백을 바탕으로 LabFlow의 실행 흐름, Command Center, 예약 챗봇, 예약 수정/취소 기능을 개선하기 위한 작업 메모입니다.

핵심 방향은 **Command Center를 메인 대화 UI로 만들고**, 기존 예약 챗봇 로직을 그 안으로 흡수하는 것입니다.

---

## 0. 현재 구조 요약

현재 메인 앱은 로그인 후 `AppMain`에서 탭 기반으로 동작합니다. 기본 첫 화면은 `activeTab = "status"`라서 장비 현황 화면이 뜹니다. 탭은 장비 현황, 예약 챗봇, 매뉴얼 챗봇, 데이터 분석, 파일 동기화, 체크인/아웃, 캘린더, 사용 로그로 분리되어 있습니다.

예약 챗봇은 바로 대화창이 아니라 `RoomList → ChatBot` 구조입니다. 방을 선택해야 `ChatBot`이 열리고, 방이 없으면 방을 만들어야 합니다.

`ChatBot.jsx`는 `/rooms/{room.id}/messages`로 기록을 불러오고, 메시지 전송 시 `/chat/`에 `room_id`, `message`, `user_id`를 보냅니다.

백엔드 `/chat/`은 예약 생성만 처리합니다. Claude가 있으면 Claude 응답에서 `create_reservation` JSON을 추출하고, 없으면 로컬 파서로 예약 생성만 fallback 처리합니다.

예약 API 자체는 `POST /reservations/`, `PATCH /reservations/{id}`, `DELETE /reservations/{id}`가 있습니다. 다만 현재 `PATCH`는 `status`만 받기 때문에 시간, 장비, 목적 수정은 불가능합니다.

---

## 1. 실행이 오래 걸리는 문제

### 원인 후보

`LabFlow_Start.bat`는 매 실행마다 Python/npm 확인, venv 확인, 프론트 의존성 확인, 마이그레이션 실행, 백엔드 실행, 프론트 실행, 프론트 응답 대기까지 수행합니다.

첫 실행에서 느린 건 정상입니다. `backend/venv`가 없으면 venv를 만들고, 프론트 `node_modules`가 없으면 `npm install`을 수행합니다.

다만 이후 실행도 느리다면 다음을 최적화합니다.

### Codex 작업 지시

`LabFlow_Start.bat` 수정:

1. 백엔드 패키지 확인을 더 안정적으로 바꿉니다. 현재는 `fastapi, sqlalchemy, uvicorn, passlib, bcrypt` import로 확인합니다. `bcrypt` import 문제로 매번 설치가 반복될 가능성이 있으니 다음처럼 바꿉니다.

```bat
"%ROOT%\backend\venv\Scripts\python.exe" -c "import fastapi, sqlalchemy, uvicorn, passlib, jose, apscheduler, anthropic" >nul 2>&1
```

2. 개발 모드에서는 `uvicorn --reload`가 시작 시 다소 느릴 수 있으니 옵션화합니다.

```bat
set "UVICORN_RELOAD=0"
if "%UVICORN_RELOAD%"=="1" (
    set "UVICORN_ARGS=--reload --port 8000"
) else (
    set "UVICORN_ARGS=--port 8000"
)
```

3. 마이그레이션은 매번 실행하지 않고, 필요 시만 실행하는 옵션으로 둡니다.

```bat
set "RUN_MIGRATION=0"
if "%RUN_MIGRATION%"=="1" (
    echo Running migration...
    ...
)
```

### 기대 결과

첫 실행은 여전히 오래 걸릴 수 있지만, 두 번째 실행부터는 훨씬 빨라져야 합니다.

---

## 2. 홈페이지가 열린 뒤 또 다른 탭이 열리는 문제

### 원인

거의 확실히 브라우저가 두 번 열리는 구조입니다.

`LabFlow_Start.bat`에서 프론트엔드를 `npm start`로 실행한 뒤, 프론트가 응답하면 직접 `http://localhost:3000`을 다시 엽니다.

프론트의 `npm start`는 `react-scripts start`입니다. Create React App 개발 서버는 기본적으로 브라우저를 자동으로 열 수 있으므로, BAT 파일의 `start "" "http://localhost:3000"`와 겹쳐서 탭이 두 번 열리는 느낌이 날 수 있습니다.

### Codex 작업 지시

`LabFlow_Start.bat`에서 프론트 실행 전에 `BROWSER=none`을 설정하고, BAT 파일이 한 번만 브라우저를 열도록 합니다.

수정 전:

```bat
echo Starting frontend...
start "LabFlow Frontend" cmd /k "cd /d ""%ROOT%\frontend"" && %NPM_CMD% start"

echo Waiting for frontend...
call :wait_for_frontend
start "" "http://localhost:3000"
```

수정 후:

```bat
echo Starting frontend...
start "LabFlow Frontend" cmd /k "cd /d ""%ROOT%\frontend"" && set BROWSER=none && %NPM_CMD% start"

echo Waiting for frontend...
call :wait_for_frontend
start "" "http://localhost:3000"
```

### 기대 결과

브라우저 탭은 하나만 열립니다.

---

## 3. Command Center 입력창을 예약 챗봇과 연결

## 목표

현재 사용자는 “예약 관리 탭 → 방 생성 → 예약 챗봇” 흐름이 불편하다고 느낍니다.

원하는 방향은 다음과 같습니다.

> 첫 화면의 Command Center 입력창에서 바로 예약, 예약 조회, 예약 수정/취소, 매뉴얼 질문을 처리한다.  
> 대화 기록은 ChatGPT/Gemini처럼 왼쪽 사이드바에서 선택한다.  
> 굳이 “예약 챗봇” 탭에 들어가서 별도 예약방을 만들 필요가 없다.

현재 코드에는 `Command Center`라는 별도 컴포넌트명은 보이지 않고, 기본 첫 화면은 `EquipmentStatus`입니다. 따라서 Codex는 새 컴포넌트를 만들어 메인 탭 구조를 재편하는 방식으로 작업합니다.

---

## 3-1. 프론트 구조 변경

### 새 컴포넌트

생성:

```text
frontend/src/components/CommandCenter.jsx
```

역할:

1. 중앙 대화창 표시
2. 하단 프롬프트 입력창
3. 왼쪽 대화 기록 사이드바
4. 기존 예약 챗봇 `ChatBot.jsx`의 메시지 UI/전송 로직 재사용
5. 기본 대화방 자동 생성 또는 자동 선택

### App.jsx 수정

현재 탭 목록에서 `status`가 첫 화면이고, `chat`은 예약 챗봇입니다.

수정 방향:

```jsx
import CommandCenter from "./components/CommandCenter";
```

`TABS`를 다음처럼 단순화:

```jsx
const TABS = [
  { id: "command", icon: "⌘", label: "Command Center" },
  { id: "status", icon: "🖥️", label: "장비 현황" },
  { id: "calendar", icon: "📅", label: "캘린더" },
  { id: "checkin", icon: "⚡", label: "체크인/아웃" },
  { id: "logs", icon: "📋", label: "사용 로그" },
];
```

기본 탭 변경:

```jsx
const [activeTab, setActiveTab] = useState("command");
```

렌더링 추가:

```jsx
{activeTab === "command" && (
  <CommandCenter userId={auth.user_id} nickname={auth.name} />
)}
```

기존 `chat`, `manual`, `analysis`, `filesync` 탭은 일단 제거하거나 “추후 기능”으로 숨깁니다. 사용자가 원하는 핵심은 중앙 Command Center 통합입니다.

---

## 3-2. RoomList 제거 또는 사이드바화

현재 `RoomList.jsx`는 닉네임 입력, 방 생성, 방 선택을 별도 화면으로 보여줍니다.

수정 방향:

1. `RoomList` 전체 화면 진입을 없앱니다.
2. `CommandCenter` 내부 왼쪽 사이드바로 대화방 목록을 표시합니다.
3. 첫 접속 시 기본 방이 없으면 자동 생성합니다.

예시 로직:

```jsx
async function ensureDefaultRoom() {
  const res = await axios.get(`${API_BASE}/rooms/`, {
    params: { nickname },
  });

  if (res.data.length > 0) {
    setRooms(res.data);
    setCurrentRoom(res.data[0]);
    return;
  }

  const created = await axios.post(`${API_BASE}/rooms/`, {
    nickname,
    room_name: "새 대화",
  });

  setRooms([created.data]);
  setCurrentRoom(created.data);
}
```

사이드바에는 `+ 새 대화`, 기존 대화 목록, 삭제 버튼만 둡니다.

---

## 3-3. ChatBot.jsx 재사용 방향

현재 `ChatBot.jsx`는 구조가 잘 잡혀 있습니다. 기록 로딩, 메시지 렌더링, `/chat/` 전송, Enter 전송이 이미 구현되어 있습니다.

Codex는 두 가지 중 하나로 구현합니다.

### 추천 방식 A: ChatBot을 일반화

`ChatBot.jsx`에서 `onBack`, 헤더, 방 목록 의존성을 옵션화합니다.

```jsx
export default function ChatBot({
  room,
  nickname,
  userId,
  onBack,
  compact = false,
  showHeader = true,
})
```

`CommandCenter`에서는:

```jsx
<ChatBot
  room={currentRoom}
  nickname={nickname}
  userId={userId}
  showHeader={false}
  compact
/>
```

### 추천 방식 B: ChatBot 로직을 CommandCenter에 복사

빠르게 구현하려면 `ChatBot.jsx`의 핵심 로직을 `CommandCenter.jsx`에 복사해도 됩니다. 하지만 유지보수는 방식 A가 좋습니다.

---

## 4. 예약 수정/취소 기능

## 현재 문제

예약 생성은 됩니다. 하지만 챗봇에서 수정/취소는 처리하지 않습니다.

백엔드 예약 API에는 삭제 API가 있습니다. `DELETE /reservations/{reservation_id}`는 DB에서 예약을 삭제하고 Google Calendar 이벤트도 삭제합니다.

상태 변경 API도 있습니다. `PATCH /reservations/{reservation_id}`는 `status`만 변경할 수 있고, `cancelled`가 되면 Google Calendar 이벤트 삭제를 호출합니다.

하지만 시간/장비/목적 수정은 현재 스키마상 불가능합니다. `ReservationUpdate`가 `status`만 받기 때문입니다.

---

## 4-1. 백엔드 예약 수정 API 확장

`backend/routers/reservation.py` 수정.

현재:

```python
class ReservationUpdate(BaseModel):
    status: ReservationStatus
```

수정:

```python
class ReservationUpdate(BaseModel):
    equipment_id: Optional[int] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    purpose: Optional[str] = None
    status: Optional[ReservationStatus] = None
```

`update_reservation_status` 함수명도 더 일반적으로 변경:

```python
def update_reservation(
    reservation_id: int,
    data: ReservationUpdate,
    db: Session = Depends(get_db),
):
```

필수 검증:

1. 예약 존재 여부
2. 새 시간이 들어온 경우 `end_time > start_time`
3. 장비/시간이 바뀌면 충돌 검사
4. 자기 자신 예약은 충돌 검사에서 제외
5. 취소 시 Google Calendar 삭제
6. 시간/목적 수정 시 Google Calendar 업데이트

충돌 검사 예시:

```python
new_equipment_id = data.equipment_id or reservation.equipment_id
new_start = data.start_time or reservation.start_time
new_end = data.end_time or reservation.end_time

conflict = db.query(Reservation).filter(
    Reservation.id != reservation.id,
    Reservation.equipment_id == new_equipment_id,
    Reservation.status != ReservationStatus.cancelled,
    Reservation.start_time < new_end,
    Reservation.end_time > new_start,
).first()
```

---

## 4-2. 챗봇 액션 확장

`backend/routers/chat.py`의 시스템 프롬프트는 현재 예약 생성 JSON만 요구합니다.

다음 액션을 추가합니다.

```json
{
  "action": "cancel_reservation",
  "reservation_id": 12
}
```

```json
{
  "action": "update_reservation",
  "reservation_id": 12,
  "equipment_id": 1,
  "start_time": "2026-06-05T14:00:00",
  "end_time": "2026-06-05T16:00:00",
  "purpose": "시료 분석"
}
```

```json
{
  "action": "list_reservations",
  "user_id": 1
}
```

새 handler 추가:

```python
def handle_cancel_reservation_action(action_data, clean_text, request, db):
    ...
```

```python
def handle_update_reservation_action(action_data, clean_text, request, db):
    ...
```

```python
def handle_list_reservations_action(action_data, clean_text, request, db):
    ...
```

`chat()` 마지막 액션 분기 수정:

```python
if action_data:
    action = action_data.get("action")
    if action == "create_reservation":
        return handle_reservation_action(...)
    if action == "cancel_reservation":
        return handle_cancel_reservation_action(...)
    if action == "update_reservation":
        return handle_update_reservation_action(...)
    if action == "list_reservations":
        return handle_list_reservations_action(...)
```

---

## 4-3. 로컬 fallback도 최소 지원

Claude API 키가 없을 때도 취소/조회 정도는 작동해야 합니다.

현재 로컬 fallback은 `"예약"`이 포함된 경우 예약 생성 정보만 찾습니다.

추가할 간단 규칙:

```python
if any(word in message for word in ["취소", "삭제", "예약 취소"]):
    reservation_id = extract_reservation_id(message)
    if not reservation_id:
        return "취소할 예약 ID를 알려주세요. 예: '예약 12번 취소해줘'"
    ...
```

```python
if any(word in message for word in ["내 예약", "예약 조회", "예약 목록"]):
    ...
```

```python
if any(word in message for word in ["변경", "수정", "시간 바꿔"]):
    ...
```

---

## 5. Command Center에서 매뉴얼 챗봇도 쓰고 싶음

현재 `ManualChatBot.jsx`는 백엔드 미연결 데모 UI입니다. 코드 주석에도 “프론트 인터페이스 전용”, “추후 연결 예정”이라고 되어 있습니다.

따라서 이번 수정 범위에서는 다음 정도가 현실적입니다.

1. Command Center에서 “XRD 사용법 알려줘”, “SEM 매뉴얼” 같은 질문이 들어오면 데모 응답을 반환합니다.
2. 실제 RAG/FAISS 연동은 이번 scope 밖으로 둡니다.
3. 추후 `/manual-chat/` 같은 백엔드 엔드포인트를 만들 수 있게 TODO를 남깁니다.

---

## 6. Codex에게 줄 최종 작업 순서

### Phase 1 — 실행/탭 중복 문제

1. `LabFlow_Start.bat`에서 `set BROWSER=none` 추가.
2. 브라우저는 BAT 파일에서 한 번만 열리게 유지.
3. 백엔드 패키지 import check 안정화.
4. 필요하면 `--reload`, migration 실행을 옵션화.

### Phase 2 — Command Center 도입

1. `frontend/src/components/CommandCenter.jsx` 생성.
2. 왼쪽 사이드바: 대화방 목록, 새 대화, 삭제.
3. 중앙: `ChatBot` 재사용 또는 내부 구현.
4. 첫 접속 시 기본 대화방 자동 생성.
5. `App.jsx` 기본 탭을 `command`로 변경.
6. 기존 `예약 챗봇` 탭은 제거하거나 숨김.

### Phase 3 — 예약 수정/취소 API

1. `ReservationUpdate`를 optional field 기반으로 확장.
2. `PATCH /reservations/{id}`에서 시간/장비/목적/상태 수정 지원.
3. 충돌 검사 추가.
4. Google Calendar sync 유지.
5. `DELETE`는 유지하되, 챗봇에서는 우선 `PATCH status=cancelled` 방식 추천.

### Phase 4 — 챗봇 액션 확장

1. 시스템 프롬프트에 `create_reservation`, `update_reservation`, `cancel_reservation`, `list_reservations` 액션 정의.
2. `chat.py`에 각 action handler 추가.
3. 로컬 fallback에도 예약 조회/취소/수정 최소 지원.
4. 응답 메시지는 사용자에게 예약 ID, 장비, 시간, 목적을 명확히 보여주기.

---

## Codex용 프롬프트 초안

```text
You are modifying the gijun branch of 206Maximus/labflow.

Goal:
Refactor LabFlow so the first screen is a central Command Center chat, similar to ChatGPT/Gemini. The user should not need to open a separate reservation chatbot tab, create a separate reservation room, and then chat. Existing reservation chatbot behavior should be reused inside the Command Center.

Tasks:

1. Fix duplicate browser tab on startup.
- In LabFlow_Start.bat, prevent react-scripts from auto-opening the browser by setting BROWSER=none before npm start.
- Keep the script’s explicit browser open after wait_for_frontend, so only one tab opens.
- Improve backend dependency check so it does not reinstall packages unnecessarily.
- Optionally make uvicorn --reload and migration configurable.

2. Add CommandCenter.
- Create frontend/src/components/CommandCenter.jsx.
- It should show a left sidebar with chat histories/rooms and a main chat area.
- On first load, use the logged-in user name as nickname and auto-create a default room if none exists.
- Reuse ChatBot.jsx if possible by making ChatBot accept showHeader/compact props.
- The prompt input in Command Center must call the same /api/v1/chat/ endpoint currently used by ChatBot.jsx.
- Users should be able to create a new conversation from the sidebar and click previous conversations.

3. Update App.jsx.
- Make Command Center the default first tab.
- Remove or hide the separate reservation chatbot tab from top navigation.
- Keep equipment status, calendar, check-in/out, and logs available as supporting tabs.
- Manual chatbot/data analysis/file sync can be hidden for now or treated as future features.

4. Support reservation modification and cancellation.
- In backend/routers/reservation.py, expand ReservationUpdate so it can optionally update equipment_id, start_time, end_time, purpose, and status.
- Validate end_time > start_time.
- If equipment/time changes, check for conflicting reservations excluding the current reservation.
- Keep Google Calendar update/delete sync behavior.
- Cancellation should be possible via status=cancelled and should delete/sync the Google Calendar event.

5. Extend backend/routers/chat.py actions.
- Current chat only supports create_reservation.
- Add actions:
  - list_reservations
  - update_reservation
  - cancel_reservation
- Update build_system_prompt to describe these JSON action formats.
- Add handlers for each action.
- Add local fallback handling for simple Korean commands:
  - “내 예약 보여줘”
  - “12번 예약 취소해줘”
  - “12번 예약 내일 오후 3시로 바꿔줘”
- Return clear Korean replies including reservation ID, equipment, start/end time, status, and purpose.

Acceptance criteria:
- Running LabFlow_Start.bat opens only one browser tab.
- After login, the first screen is Command Center.
- Typing “내일 오후 2시에 XRD 2시간 예약해줘” in Command Center creates a reservation.
- Typing “내 예약 보여줘” lists my reservations.
- Typing “예약 12번 취소해줘” cancels reservation #12.
- Typing “예약 12번 내일 오후 4시로 바꿔줘” updates reservation time if no conflict exists.
- Existing calendar/check-in/equipment status screens still work.
```

---

## 작업 운영 제안

이 작업은 한 번에 Codex에게 맡기기보다 다음 순서로 나눠 진행하는 것이 안전합니다.

1. **Phase 1**: 실행 지연/중복 탭 문제만 먼저 수정
2. **Phase 2**: Command Center UI 도입
3. **Phase 3**: 예약 수정/취소 API 확장
4. **Phase 4**: 챗봇 액션 확장

판단상 1, 2번은 작은 수정이고, 3번은 프론트 구조 변경, 4번은 백엔드 기능 확장입니다.
