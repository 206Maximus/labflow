# LabFlow

LabFlow는 연구실 장비 예약, 체크인/체크아웃, 사용 로그, 안전교육 인증, 노쇼 관리, AI 예약 챗봇, Google Calendar 연동을 한 화면에서 다루는 연구실 장비 관리 플랫폼입니다.

현재 구현은 **React 프론트엔드 + FastAPI 백엔드 + SQLite 개발 DB**를 기준으로 로컬 실행에 맞춰져 있습니다. PostgreSQL은 선택 설정으로 남아 있고, S3/RAG/데이터 분석 백엔드 연동은 아직 데모 또는 예정 기능입니다.

## 현재 상태

2026-06-02 기준으로 저장소에 반영된 주요 상태입니다.

- Windows 원클릭 실행 스크립트 `LabFlow_Start.bat`가 있습니다.
- 기본 DB는 `backend/labflow_dev.db` SQLite 파일입니다.
- 회원가입/로그인, JWT 인증, Google 로그인, Google Calendar OAuth가 구현되어 있습니다.
- 예약 생성 시 안전교육 인증 여부, 노쇼 장비 사용 제한, 시간대 충돌을 검사합니다.
- 예약 생성/수정/삭제, 체크인/체크아웃 시 Google Calendar가 연결된 사용자라면 일정 동기화를 시도합니다.
- 노쇼 자동 감지와 안전교육 리마인더 점검은 APScheduler로 백그라운드에서 실행됩니다.
- 예약 챗봇은 `ANTHROPIC_API_KEY`가 있으면 Claude를 사용하고, 키가 없으면 간단한 로컬 예약 파싱 fallback으로 동작합니다.
- 매뉴얼 챗봇, 데이터 분석 챗봇, 파일 동기화 화면은 현재 프론트엔드 데모 UI 성격이 강합니다.

## 주요 기능

| 영역 | 구현 내용 |
| --- | --- |
| 인증 | 이메일/비밀번호 회원가입, 로그인, JWT, Google 로그인 |
| 장비/예약 | 장비별 예약, 캘린더 조회, 예약 상태 변경, 체크인/체크아웃 |
| 안전교육 | 사용자별 안전교육 인증 상태, 관리자 인증/해제, 리마인더 대상 조회 |
| 노쇼 | 미체크인 예약 자동 감지, 장비별 사용 제한, 노쇼 상태 조회 |
| 로그 | 장비 사용 로그, 예약/사용 이력 대시보드 |
| 챗봇 | 채팅방 기반 예약 챗봇, Claude API optional, 로컬 fallback |
| Google Calendar | Google OAuth, 예약 일정 동기화, freebusy 조회, 연결 해제 |
| 데모 UI | 매뉴얼 챗봇, 데이터 분석 챗봇, 파일 동기화 화면 |

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | React 18, React Scripts, FullCalendar, Axios |
| Backend | FastAPI, SQLAlchemy 2, Pydantic 2, Uvicorn |
| Database | SQLite 기본, PostgreSQL 선택 |
| Auth | JWT, passlib, python-jose, Google OAuth |
| Scheduler | APScheduler |
| AI | Anthropic Claude API optional |
| Calendar | Google Calendar API |

## 프로젝트 구조

```text
labflow/
├─ backend/
│  ├─ main.py                    # FastAPI 앱 진입점, router 등록, scheduler 시작
│  ├─ database.py                # SQLite/PostgreSQL 연결 설정
│  ├─ models.py                  # SQLAlchemy 모델
│  ├─ auth_utils.py              # JWT, 비밀번호 해시, 현재 사용자 인증
│  ├─ migrate_noshow_safety.py   # 로컬 DB 마이그레이션 보조 스크립트
│  ├─ routers/
│  │  ├─ auth.py                 # 회원가입/로그인/Google 로그인
│  │  ├─ reservation.py          # 예약, 체크인/체크아웃
│  │  ├─ logs.py                 # 사용 로그
│  │  ├─ rooms.py                # 채팅방
│  │  ├─ chat.py                 # 예약 챗봇
│  │  ├─ safety.py               # 안전교육 인증
│  │  ├─ noshow.py               # 노쇼/장비 사용 제한
│  │  └─ gcal.py                 # Google Calendar 연동
│  └─ services/
│     ├─ google_calendar.py      # OAuth, token 암호화, 일정 CRUD/sync
│     └─ login_tickets.py        # Google redirect 후 임시 로그인 ticket
├─ frontend/
│  ├─ public/
│  └─ src/
│     ├─ App.jsx                 # 전체 화면/탭 구성
│     ├─ context/AuthContext.jsx # sessionStorage 기반 로그인 상태
│     ├─ pages/AuthPage.jsx      # 로그인/회원가입/Google 로그인
│     └─ components/             # 장비 현황, 예약, 캘린더, 로그, 챗봇 등
├─ LabFlow_Start.bat             # Windows 로컬 실행 스크립트
├─ LabFlow 시작.bat              # 기존 한글 이름 실행 파일
├─ LabFlow 종료.bat              # 종료 보조 스크립트
├─ GCal_handoff.md               # Google 연동 작업 메모
└─ TROUBLESHOOTING_LOCAL_STARTUP.md
```

## 빠른 실행

Windows에서는 저장소 루트에서 다음 파일을 실행하는 것이 가장 편합니다.

```powershell
.\LabFlow_Start.bat
```

이 스크립트는 다음 작업을 자동으로 처리합니다.

- Python과 npm 위치 확인
- `backend/venv`가 없으면 생성
- 백엔드 패키지 설치
- 프론트엔드 패키지 설치
- 노쇼/안전교육 마이그레이션 실행
- FastAPI 백엔드 실행
- React 개발 서버 실행
- `http://localhost:3000` 브라우저 열기

실행 후 접속 주소는 다음과 같습니다.

| 서비스 | 주소 |
| --- | --- |
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger | http://localhost:8000/docs |
| ReDoc | http://localhost:8000/redoc |

## 수동 실행

### 1. 백엔드

```powershell
cd backend
py -3 -m venv venv
.\venv\Scripts\python.exe -m pip install --upgrade pip
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe migrate_noshow_safety.py
.\venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

`Base.metadata.create_all()`이 서버 시작 시 테이블을 자동 생성합니다. 기존 로컬 DB를 계속 쓰는 경우에는 `migrate_noshow_safety.py`를 한 번 실행해 주세요.

### 2. 프론트엔드

다른 터미널에서 실행합니다.

```powershell
cd frontend
npm install
npm start
```

## 환경 변수

프로젝트 루트의 `.env` 또는 백엔드 실행 환경에 필요한 값을 넣습니다. 로컬 기본 실행은 대부분 비워도 되지만, Claude와 Google 연동은 별도 설정이 필요합니다.

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

프론트엔드 API 주소를 바꾸고 싶으면 `frontend/.env`에 다음 값을 둘 수 있습니다.

```env
REACT_APP_API_URL=http://localhost:8000/api/v1
```

일부 컴포넌트는 아직 `http://localhost:8000/api/v1`을 직접 사용하므로, 현재는 로컬 개발 주소 기준으로 실행하는 것이 가장 안정적입니다.

## Google 설정

Google 로그인과 Calendar 연동을 쓰려면 Google Cloud Console의 OAuth Client에 아래 값을 등록합니다.

| 항목 | 값 |
| --- | --- |
| Authorized JavaScript origins | `http://localhost:3000` |
| Authorized redirect URIs | `http://localhost:8000/api/v1/gcal/callback` |

요청 scope는 다음과 같습니다.

```text
openid
email
profile
https://www.googleapis.com/auth/calendar.events
```

`GOOGLE_CLIENT_SECRET`, refresh token, access token은 프론트엔드에 노출하지 않습니다. `.env`, `client_secret*.json`, `gcal_token.json`, `backend/labflow_dev.db` 같은 로컬 파일은 `.gitignore`에 포함되어 있으며 커밋하지 않습니다.

## API 요약

모든 주요 API는 `/api/v1` 아래에 있습니다.

| 영역 | Endpoint |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `GET /auth/google/auth-url`, `POST /auth/google/ticket` |
| Reservations | `GET /reservations/`, `POST /reservations/`, `PATCH /reservations/{id}`, `DELETE /reservations/{id}`, `POST /reservations/{id}/checkin`, `POST /reservations/{id}/checkout` |
| Logs | `GET /logs/`, `POST /logs/`, `GET /logs/{id}`, `GET /logs/equipment/{equipment_id}/summary` |
| Rooms | `GET /rooms/`, `POST /rooms/`, `GET /rooms/{room_id}/messages`, `DELETE /rooms/{room_id}` |
| Chat | `POST /chat/` |
| Safety | `GET /safety/status`, `GET /safety/status/{user_id}`, `POST /safety/certify/{user_id}`, `DELETE /safety/certify/{user_id}`, `GET /safety/reminder-needed` |
| No-show | `GET /noshows/status/{user_id}`, `GET /noshows/bans/active`, `POST /noshows/trigger-check` |
| Google Calendar | `GET /gcal/status`, `GET /gcal/auth`, `GET /gcal/callback`, `POST /gcal/sync`, `POST /gcal/events`, `POST /gcal/freebusy`, `POST /gcal/disconnect` |

## 개발 메모

- 기본 DB 파일 `backend/labflow_dev.db`는 로컬 개발 산출물입니다.
- PostgreSQL을 쓰려면 `DB_MODE=postgres`와 `DATABASE_URL`을 설정하고 `psycopg2-binary` 설치가 필요할 수 있습니다.
- 새 비밀번호 해시는 Python 3.13 호환을 위해 `pbkdf2_sha256`을 사용합니다. 기존 bcrypt 해시는 검증만 지원합니다.
- Google token 암호화는 `TOKEN_ENCRYPTION_KEY`가 있으면 그 값을 우선 사용하고, 없으면 `JWT_SECRET_KEY` 또는 개발 기본값에서 키를 파생합니다.
- `frontend/build`, `node_modules`, `venv`, `.env`, DB 파일, Google secret 파일은 저장소에 올리지 않습니다.

## 앞으로 남은 작업

- 매뉴얼 챗봇 RAG 백엔드 연결
- 파일 동기화 실제 저장소 또는 S3 연동
- 데이터 분석 챗봇의 Vision/API/Python 분석 엔진 연결
- 관리자 권한 관리 UI 고도화
- 테스트 코드와 배포 설정 추가
- 운영 환경용 CORS, secret, DB migration 전략 정리

---

LabFlow - AI Capstone Design Project 2026
