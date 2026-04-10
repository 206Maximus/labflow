# 🔬 LabFlow — 연구실 장비 관리 플랫폼

AI Capstone Design Project 2026  
LLM 챗봇 기반 장비 예약 · AI 매뉴얼 챗봇(RAG) · 자동 사용 로그 · 파일 동기화

---

## 📁 프로젝트 구조

```
labflow/
├── frontend/                   # React + FullCalendar.js
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatBot.jsx        # 챗봇 예약 UI
│   │   │   ├── Calendar.jsx       # 예약 캘린더 뷰
│   │   │   └── LogDashboard.jsx   # 사용 로그 대시보드
│   │   ├── App.jsx
│   │   └── index.js
│   └── package.json
├── backend/                    # FastAPI + PostgreSQL
│   ├── main.py                 # FastAPI 앱 진입점
│   ├── database.py             # DB 연결 설정
│   ├── models.py               # SQLAlchemy ORM 모델
│   ├── routers/
│   │   ├── reservation.py      # 예약 API
│   │   └── logs.py             # 로그 API
│   └── requirements.txt
└── README.md
```

---

## ⚙️ 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 18, FullCalendar.js 6, Axios |
| Backend | FastAPI, SQLAlchemy 2, Uvicorn |
| Database | PostgreSQL 15 |
| AI | GPT-4o / Claude API, FAISS, LangChain (RAG) |
| 파일 저장 | AWS S3 |
| 캘린더 연동 | Google Calendar API |

---

## 🚀 로컬 실행 방법

### 1. 사전 요구사항

- Python 3.11+
- Node.js 18+
- PostgreSQL 15+ (로컬 또는 Docker)

---

### 2. PostgreSQL 데이터베이스 설정

```bash
# PostgreSQL 접속
psql -U postgres

# DB 및 유저 생성
CREATE DATABASE labflow;
CREATE USER labflow_user WITH PASSWORD 'labflow_pass';
GRANT ALL PRIVILEGES ON DATABASE labflow TO labflow_user;
\q
```

또는 Docker를 사용하는 경우:

```bash
docker run -d \
  --name labflow-postgres \
  -e POSTGRES_DB=labflow \
  -e POSTGRES_USER=labflow_user \
  -e POSTGRES_PASSWORD=labflow_pass \
  -p 5432:5432 \
  postgres:15
```

---

### 3. Backend 실행 (FastAPI)

```bash
cd labflow/backend

# 가상환경 생성 및 활성화
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt

# 서버 실행 (개발 모드, 자동 재시작)
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

실행 후 접속:
- API 서버: http://localhost:8000
- Swagger 문서: http://localhost:8000/docs
- ReDoc 문서: http://localhost:8000/redoc

> **Note:** 서버 최초 실행 시 `Base.metadata.create_all()` 이 자동으로 테이블을 생성합니다.

---

### 4. Frontend 실행 (React)

```bash
cd labflow/frontend

# 의존성 설치
npm install

# 개발 서버 실행
npm start
```

실행 후 접속: http://localhost:3000

---

### 5. 환경 변수 설정 (선택)

`backend/` 디렉터리에 `.env` 파일 생성:

```env
DATABASE_URL=postgresql://labflow_user:labflow_pass@localhost:5432/labflow
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_S3_BUCKET=labflow-files
GOOGLE_CALENDAR_CREDENTIALS=path/to/credentials.json
```

`frontend/` 디렉터리에 `.env` 파일 생성:

```env
REACT_APP_API_URL=http://localhost:8000/api/v1
```

---

## 📡 API 엔드포인트 요약

### 예약 API (`/api/v1/reservations`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/` | 전체 예약 목록 |
| GET | `/{id}` | 특정 예약 조회 |
| POST | `/` | 새 예약 생성 |
| PATCH | `/{id}` | 예약 상태 변경 |
| DELETE | `/{id}` | 예약 삭제 |

### 로그 API (`/api/v1/logs`)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/` | 전체 로그 목록 |
| GET | `/{id}` | 특정 로그 조회 |
| POST | `/` | 새 로그 기록 |
| GET | `/equipment/{id}/summary` | 장비별 통계 |

---

## 🗺️ 개발 로드맵

- [x] 프로젝트 초기 구조 설정
- [x] DB 모델 정의 (Equipment, User, Reservation, UsageLog)
- [x] 예약 / 로그 REST API
- [x] 챗봇 UI / 캘린더 / 로그 대시보드 컴포넌트
- [ ] LLM 챗봇 백엔드 연결 (GPT-4o / Claude)
- [ ] RAG 기반 매뉴얼 챗봇 (FAISS + LangChain)
- [ ] Google Calendar API 연동
- [ ] AWS S3 파일 업로드
- [ ] XRD / SEM / TEM 데이터 분석 기능
- [ ] 사용자 인증 (JWT)
- [ ] 배포 (AWS / GCP)

---

## 👥 팀원

> 팀원 정보를 여기에 추가하세요.

---

*LabFlow — AI Capstone Design Project 2026*
