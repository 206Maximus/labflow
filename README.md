# LabFlow

LabFlow는 연구실 장비 예약, 체크인/체크아웃, 사용 로그, 안전교육 인증, 노쇼 제한, AI 예약 채팅, Google Calendar 연동을 한 화면에서 다루기 위한 로컬 개발용 웹 애플리케이션입니다.

이 README는 GPT/Codex/다음 작업자가 프로젝트를 가장 먼저 읽고 현재 상황을 파악하도록 만든 인수인계 문서입니다. 배포용 홍보 문서보다 "지금 무엇이 구현되어 있고, 어디가 위험하며, 다음에 무엇을 봐야 하는지"를 우선합니다.

## 현재 스냅샷

마지막 확인: 2026-06-05, `gijun` 브랜치, 로컬 경로 `C:\labflow_UI`.

- 원격 저장소: `https://github.com/206Maximus/labflow.git`
- 프론트엔드: React 18, Create React App, FullCalendar, Axios
- 백엔드: FastAPI, SQLAlchemy 2, Pydantic 2, APScheduler
- DB: 기본 SQLite `backend/labflow_dev.db`, PostgreSQL은 선택 설정
- 로컬 실행 진입점: `LabFlow_시작.bat`
- 기본 접속 주소: frontend `http://127.0.0.1:3000`, backend `http://localhost:8000`
- 현재 첫 화면: 로그인 후 `CommandCenter`가 기본 화면. Home은 프롬프트 제출 후 채팅방 레이아웃으로 전환됨
- 이전 README와 여러 한글 주석/문자열은 인코딩이 깨진 상태였고, 이 README만 새로 UTF-8로 정리함

## 현재 구현 범위

| 영역 | 상태 |
| --- | --- |
| 인증 | 이메일/비밀번호 회원가입, 로그인, JWT, Google 로그인 티켓 흐름 |
| 메인 UI | `CommandCenter`가 첫 화면. 사이드바 메뉴와 하단 대화 기록, 우측 캘린더 도크 포함 |
| 예약 API | 생성, 조회, 수정, 삭제, 체크인, 체크아웃 |
| 예약 검증 | 일반 예약 API는 시간 충돌, 안전교육 인증, 노쇼 장비 ban을 검사 |
| 채팅 예약 | `/api/v1/chat/`에서 예약 생성, 목록 조회, 수정, 취소 액션 처리. Home 채팅에서는 예약 검토/완료 카드가 assistant 메시지 안에 표시됨 |
| Google Calendar | OAuth, 연결 상태, sync, event create/update/delete, freebusy, disconnect |
| 안전교육 | 사용자별 인증/해제, 상태 조회, 리마인더 대상 조회 |
| 노쇼 | 자동 감지, 노쇼 누적, 장비별 ban, 활성 ban 조회 |
| 로그 | 장비 사용 로그 생성/조회, 장비별 요약 |
| 스케줄러 | FastAPI lifespan에서 노쇼 체크 1분 간격, 안전교육 리마인더 점검 1일 간격 |
| 캘린더 UI | 메인 FullCalendar는 09:00-18:00 주/일 시간대를 표시. 우측 도크는 LabFlow 예약 미니 캘린더와 Google freebusy 기반 미니 캘린더를 함께 표시 |
| 데모/보류 UI | ManualChatBot, DataAnalysisChatBot, FileSync, RoomList, AdminLog 등은 남아 있으나 현재 메인 흐름에서는 대부분 숨겨져 있음 |

## 가장 중요한 주의점

1. 한글 문자열 인코딩 이력에 주의하세요.
   - 현재 주요 UI 파일은 UTF-8 기준으로 읽히지만, 과거 handoff/docs와 일부 주석에는 깨진 문자열이 섞여 있을 수 있습니다.
   - 문자열을 고칠 때는 PowerShell 출력 인코딩이 아니라 파일 자체를 UTF-8로 확인하세요.

2. 채팅 예약 생성은 일반 예약 API 검증을 완전히 공유하지 않습니다.
   - `backend/routers/reservation.py`의 `create_reservation()`은 안전교육 인증과 노쇼 ban을 검사합니다.
   - `backend/routers/chat.py`의 `handle_reservation_action()`은 직접 `Reservation`을 생성하며 현재 시간 충돌 중심으로 처리합니다.
   - 다음 작업에서는 예약 생성/수정 검증을 공용 service 함수로 빼서 API와 chat이 같은 경로를 타게 하는 것이 안전합니다.

3. `CommandCenter`의 예약 검토 카드는 프론트 파서와 백엔드 채팅 액션이 함께 동작합니다.
   - 예: `7월 3일 오후 2시부터 2시간동안 SEM 예약해줘`는 검토 카드에서 `7월 3일 14:00 - 16:00`으로 표시하고, 확인 시 같은 시간 정보를 백엔드 채팅 요청에 전달합니다.

4. `ANTHROPIC_API_KEY`는 선택입니다.
   - 키가 있으면 Claude를 사용합니다.
   - 없으면 로컬 fallback이 동작하지만 자연어 이해 범위가 좁고, 현재 깨진 한글 문자열의 영향을 받습니다.

5. 자동 테스트는 거의 없습니다.
   - 현재 확인은 frontend build와 backend compile 중심입니다.
   - API 단위 테스트, 채팅 액션 테스트, Google Calendar mock 테스트는 추가 필요합니다.

## 실행 방법

Windows에서는 루트에서 이 파일을 실행하는 것이 기본입니다.

```powershell
.\LabFlow_시작.bat
```

이 스크립트가 하는 일:

- `create_shortcut.vbs`로 바탕화면 바로가기 생성 시도
- Python 3과 npm 탐색, `C:\anaconda3` 경로도 후보로 사용
- `backend/venv`가 없으면 생성
- 백엔드 패키지가 부족하면 `backend/requirements.txt` 설치
- `frontend/node_modules/.bin/react-scripts.cmd`가 없으면 `npm install --no-audit --no-fund`
- `RUN_MIGRATION=0` 기본값으로 migration은 건너뜀
- `UVICORN_RELOAD=0` 기본값으로 backend reload 없이 실행
- `BROWSER=none`, `PORT=3000`으로 React 자동 브라우저 열기를 막음
- frontend가 응답할 때까지 기다린 뒤 `http://127.0.0.1:3000`을 한 번만 엶

종료는 루트에서 다음 파일을 사용합니다.

```powershell
.\LabFlow 종료.bat
```

## 수동 실행

백엔드:

```powershell
cd C:\labflow_UI\backend
.\venv\Scripts\python.exe -m uvicorn main:app --port 8000
```

프론트엔드:

```powershell
cd C:\labflow_UI\frontend
$env:PATH='C:\anaconda3;' + $env:PATH
$env:BROWSER='none'
$env:PORT='3000'
C:\anaconda3\npm.cmd start
```

직접 `npm`을 실행할 때 `node`를 못 찾는다면 `C:\anaconda3`를 PATH 앞에 붙여야 합니다. `C:\anaconda3\npm.cmd` 자체는 있어도 내부에서 호출되는 `node`가 PATH에 없으면 실패합니다.

## 검증 결과

2026-06-05에 확인한 결과:

```powershell
$env:PATH='C:\anaconda3;' + $env:PATH
C:\anaconda3\npm.cmd run build
```

결과: 성공. 경고 2개가 남아 있습니다.

- `frontend/src/components/EquipmentStatus.jsx`: `now` 미사용
- `frontend/src/components/LogDashboard.jsx`: `useEffect` dependency에 `fetchLogs` 누락

백엔드 컴파일 확인:

```powershell
backend\venv\Scripts\python.exe -m compileall -q backend\main.py backend\database.py backend\auth_utils.py backend\models.py backend\migrate_add_gcal.py backend\migrate_noshow_safety.py backend\routers backend\services
```

결과: 성공.

## 환경 변수

루트 `.env` 또는 백엔드 실행 환경에 둘 수 있습니다. 로컬 기본 실행은 대부분 비워도 되지만 Google/Claude는 별도 설정이 필요합니다.

```env
# Database
DB_MODE=sqlite
# DB_MODE=postgres
# DATABASE_URL=postgresql://labflow_user:labflow_pass@localhost:5432/labflow

# Auth
JWT_SECRET_KEY=change-this-for-real-use
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# AI reservation chatbot
ANTHROPIC_API_KEY=

# Frontend redirect target after Google OAuth
FRONTEND_URL=http://localhost:3000

# Google OAuth / Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/gcal/callback
TOKEN_ENCRYPTION_KEY=
```

프론트엔드 API 주소를 바꾸려면 `frontend/.env`에 다음 값을 둡니다.

```env
REACT_APP_API_URL=http://localhost:8000/api/v1
```

## 프로젝트 구조

```text
C:\labflow_UI
├─ backend/
│  ├─ main.py                    # FastAPI app, CORS, router 등록, scheduler 시작
│  ├─ database.py                # SQLite/PostgreSQL 연결 설정
│  ├─ models.py                  # SQLAlchemy 모델
│  ├─ auth_utils.py              # JWT, 비밀번호 해시, 현재 사용자 인증
│  ├─ migrate_add_gcal.py        # Google Calendar 관련 기존 DB migration 보조
│  ├─ migrate_noshow_safety.py   # 노쇼/안전교육 migration 보조
│  ├─ routers/
│  │  ├─ auth.py                 # 회원가입, 로그인, Google 로그인
│  │  ├─ reservation.py          # 예약 CRUD, 체크인/아웃
│  │  ├─ chat.py                 # AI/로컬 예약 채팅 액션
│  │  ├─ rooms.py                # 채팅방과 메시지 기록
│  │  ├─ logs.py                 # 사용 로그
│  │  ├─ safety.py               # 안전교육 인증
│  │  ├─ noshow.py               # 노쇼와 장비 ban
│  │  └─ gcal.py                 # Google Calendar API
│  └─ services/
│     ├─ google_calendar.py      # OAuth, token 암호화, calendar CRUD/sync/freebusy
│     └─ login_tickets.py        # Google redirect 후 임시 로그인 ticket
├─ frontend/
│  ├─ package.json
│  └─ src/
│     ├─ App.jsx                 # 인증 후 전체 shell, 기본 view는 command
│     ├─ context/AuthContext.jsx # sessionStorage 기반 auth state
│     ├─ pages/AuthPage.jsx      # 로그인/회원가입/Google 로그인
│     └─ components/
│        ├─ CommandCenter.jsx    # 현재 메인 화면
│        ├─ Calendar.jsx
│        ├─ EquipmentStatus.jsx
│        ├─ CheckInOut.jsx
│        ├─ LogDashboard.jsx
│        ├─ SafetyBadge.jsx
│        ├─ NoShowStatusButton.jsx
│        └─ 기타 실험/보류 컴포넌트
├─ docs/handoff/command_center_refactor_plan.md
├─ GCal_handoff.md
├─ UI_handoff.md
├─ TROUBLESHOOTING_LOCAL_STARTUP.md
├─ LabFlow_시작.bat
└─ LabFlow 종료.bat
```

## 주요 API

모든 주요 라우터는 `/api/v1` 아래에 붙습니다.

| 영역 | Endpoint |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/login/form`, `GET /auth/me`, `GET /auth/google/auth-url`, `GET /auth/google/start`, `POST /auth/google/code`, `POST /auth/google/ticket` |
| Reservations | `GET /reservations/`, `GET /reservations/{id}`, `POST /reservations/`, `PATCH /reservations/{id}`, `DELETE /reservations/{id}`, `POST /reservations/{id}/checkin`, `POST /reservations/{id}/checkout` |
| Chat | `POST /chat/` |
| Rooms | `GET /rooms/`, `POST /rooms/`, `GET /rooms/{room_id}/messages`, `DELETE /rooms/{room_id}` |
| Logs | `GET /logs/`, `GET /logs/{id}`, `POST /logs/`, `GET /logs/equipment/{equipment_id}/summary` |
| Safety | `GET /safety/status`, `GET /safety/status/{user_id}`, `POST /safety/certify/{user_id}`, `DELETE /safety/certify/{user_id}`, `GET /safety/reminder-needed`, `POST /safety/reminder/mark-sent/{user_id}` |
| No-show | `GET /noshows/status/{user_id}`, `GET /noshows/bans/active`, `POST /noshows/trigger-check` |
| Google Calendar | `GET /gcal/status`, `GET /gcal/auth`, `GET /gcal/callback`, `POST /gcal/sync`, `POST /gcal/events`, `POST /gcal/freebusy`, `POST /gcal/disconnect` |

## 채팅 액션 현황

`backend/routers/chat.py`는 Claude 응답 끝의 JSON action 또는 로컬 fallback으로 아래 액션을 처리합니다.

```json
{
  "action": "create_reservation",
  "equipment_id": 2,
  "user_id": 1,
  "start_time": "2026-06-05T14:00:00",
  "end_time": "2026-06-05T15:00:00",
  "purpose": "sample analysis"
}
```

```json
{ "action": "list_reservations", "user_id": 1 }
```

```json
{ "action": "cancel_reservation", "reservation_id": 12 }
```

```json
{
  "action": "update_reservation",
  "reservation_id": 12,
  "equipment_id": 2,
  "start_time": "2026-06-05T16:00:00",
  "end_time": "2026-06-05T17:00:00",
  "purpose": "changed purpose"
}
```

다음 작업자는 이 액션 처리를 `reservation.py`의 검증 로직과 합치는 것을 먼저 고려하세요.

## Google Calendar 설정

Google Cloud Console OAuth Client에는 로컬 기준으로 다음 값을 등록합니다.

| 항목 | 값 |
| --- | --- |
| Authorized JavaScript origins | `http://localhost:3000`, 필요하면 `http://127.0.0.1:3000` |
| Authorized redirect URIs | `http://localhost:8000/api/v1/gcal/callback` |

요청 scope:

```text
openid
email
profile
https://www.googleapis.com/auth/calendar.events
```

Google token은 DB의 `google_accounts`에 암호화되어 저장됩니다. `TOKEN_ENCRYPTION_KEY`가 있으면 그 값을 쓰고, 없으면 개발 기본값 계열로 동작합니다. 운영 성격으로 쓰려면 반드시 고정된 secret을 설정해야 합니다.

## 로컬 파일과 Git

다음 파일/폴더는 저장소에 올리지 않는 것이 맞습니다.

- `.env`, `.env.*`
- `client_secret*.json`
- `gcal_token.json`, `backend/gcal_token.json`
- `backend/labflow_dev.db`, `*.db`, `*.sqlite3`
- `backend/venv/`
- `frontend/node_modules/`
- `frontend/build/`
- `*.log`

현재 `.gitignore`는 위 항목 대부분을 포함합니다.

## 다음 작업 추천 순서

1. 깨진 한글 문자열 복구
   - 우선 사용자에게 보이는 `App.jsx`, `CommandCenter.jsx`, `ChatBot.jsx`, `chat.py` 응답 문자열부터 UTF-8로 복구합니다.

2. 예약 검증 service 분리
   - 일반 예약 API와 chat action이 같은 생성/수정/취소 로직을 쓰게 만듭니다.
   - 안전교육, 노쇼 ban, 시간 충돌, Google Calendar sync가 한 곳에서 처리되어야 합니다.

3. Command Center 실데이터화
   - 정적 데모 캘린더를 `/reservations/`와 `/gcal/freebusy` 기반으로 바꿉니다.
   - 예약 확인/시간 변경 버튼에 실제 동작을 연결합니다.

4. 최소 테스트 추가
   - 예약 생성 충돌
   - 안전교육 미인증 예약 거부
   - 노쇼 ban 예약 거부
   - chat create/list/update/cancel
   - Google Calendar는 mock으로 create/update/delete 호출 여부 확인

5. 실행 문서 정리
   - `GCal_handoff.md`, `UI_handoff.md`, `TROUBLESHOOTING_LOCAL_STARTUP.md`도 인코딩 복구하거나 이 README 기준으로 축약합니다.

## GPT/Codex에게 넘길 때

새 작업을 맡길 때는 보통 이렇게 시작하면 됩니다.

```text
README.md를 먼저 읽고 현재 상태를 기준으로 작업해줘.
특히 "가장 중요한 주의점"과 "다음 작업 추천 순서"를 기준으로 판단해줘.
기존 한글 문자열은 깨져 있을 수 있으니, 깨진 문자열을 의미 있는 한국어로 복구하는 작업과 기능 변경을 구분해서 진행해줘.
```

기존 handoff 문서는 과거 계획과 깨진 한글이 섞여 있을 수 있으므로, 현재 기준점은 이 README입니다.
