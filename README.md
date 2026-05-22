# 🔬 LabFlow — AI 기반 연구실 장비 관리 플랫폼

**AI Capstone Design Project 2026**

대학 연구실의 SEM, XRD, TEM 등 공용 고가 장비를 AI로 효율적으로 운영하는 플랫폼

---

## 🎯 최종발표 핵심 기능 2가지

### 핵심 기능 1: LLM 챗봇 기반 장비 예약

> "이번 주 SEM 2시간 연속 슬롯 찾아서 예약해줘"

자연어 → LLM 분석 → 가용 슬롯 탐색 → 후보 제시 → 예약 확정

- 사용자 자연어 요청에서 장비명·날짜·시간·연속 슬롯 조건 추출
- 기존 예약과의 충돌 자동 확인
- 가용 슬롯 최대 3개 제시 → 버튼 선택으로 즉시 예약
- Reservation DB 저장 + 캘린더 뷰 반영
- **LLM_MOCK_MODE=true 시 API Key 없이 데모 가능**

### 핵심 기능 2: AI 매뉴얼 챗봇 (RAG)

> "SEM 측정 전 시료 준비 조건이 뭐야?"

PDF 매뉴얼 → 청크 분할 → 임베딩 → FAISS 검색 → LLM 답변 + 출처 표시

- 장비별 PDF 매뉴얼 업로드 및 자동 인덱싱
- 질문 임베딩 → FAISS 유사도 검색 → top-k 청크 추출
- Claude API로 context 기반 근거 있는 답변 생성
- 답변과 함께 참고 출처 (매뉴얼명, 페이지, 청크 번호) 표시
- **RAG_MOCK_MODE=true 시 OpenAI API Key 없이 데모 가능**

---

## ⚙️ 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 18, FullCalendar.js 6, Axios |
| Backend | FastAPI, SQLAlchemy 2, Uvicorn |
| Database | SQLite (개발) / PostgreSQL (배포) |
| LLM | Claude API (anthropic SDK) |
| Embedding | OpenAI text-embedding-3-small (Mock 폴백 지원) |
| Vector DB | FAISS (numpy 코사인 유사도 폴백 지원) |
| PDF 처리 | pypdf |
| 스케줄러 | APScheduler |
| 캘린더 연동 | Google Calendar API (선택) |

---

## 🚀 로컬 실행 방법

### 사전 요구사항

- Python 3.11+
- Node.js 18+

### 1. 레포지토리 클론

```bash
git clone https://github.com/206Maximus/labflow.git
cd labflow
```

### 2. 환경변수 설정

```bash
cd backend
cp .env.example .env
# .env 파일을 편집하여 필요한 값 입력 (아래 환경변수 설명 참조)
```

### 3. Backend 실행

```bash
cd backend

# 가상환경 생성
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt

# (선택) FAISS 설치
pip install faiss-cpu

# 서버 실행
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- API 서버: http://localhost:8000
- Swagger 문서: http://localhost:8000/docs

### 4. Frontend 실행

```bash
cd frontend
npm install
npm start
```

- 앱: http://localhost:3000

---

## 🔑 환경변수 설정

`backend/.env` 파일에 설정:

```env
# ─── LLM (핵심 기능 1: 자연어 예약 챗봇) ───────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...          # Claude API 키
LLM_MOCK_MODE=false                   # true: API 없이 Mock 응답으로 데모

# ─── 임베딩 (핵심 기능 2: RAG 매뉴얼 챗봇) ─────────────────────────────────
OPENAI_API_KEY=sk-...                 # OpenAI API 키 (임베딩용)
RAG_MOCK_MODE=false                   # true: Hash 기반 Mock 임베딩으로 데모
EMBEDDING_MODEL=text-embedding-3-small

# ─── 저장 경로 ──────────────────────────────────────────────────────────────
MANUAL_UPLOAD_DIR=./uploads/manuals   # PDF 업로드 디렉터리
FAISS_INDEX_DIR=./vectorstores/faiss  # FAISS 인덱스 저장 경로

# ─── DB ─────────────────────────────────────────────────────────────────────
DB_MODE=sqlite                         # sqlite | postgresql
# DATABASE_URL=postgresql://user:pass@localhost:5432/labflow  # PostgreSQL 시

# ─── Google Calendar (선택) ──────────────────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/gcal/callback
```

> ⚠️ `.env` 파일은 절대 Git에 커밋하지 마세요. `.gitignore`에 포함되어 있습니다.

---

## 🤖 핵심 기능 1 데모 방법 (자연어 예약)

1. 브라우저에서 http://localhost:3000 접속
2. 로그인 후 상단 탭 **"예약 챗봇"** 클릭
3. 채팅방 생성 또는 입장
4. 다음 예시 중 하나를 입력:

```
이번 주 SEM 2시간 연속 슬롯 찾아줘
내일 오후 2시에 XRD 1시간 예약해줘
```

5. 슬롯 제안 버튼이 나타나면 선택 → 예약 확정
6. 상단 탭 **"캘린더"** 에서 예약 확인

**API Key 없을 때:** `.env`에 `LLM_MOCK_MODE=true` 설정 → 동일하게 동작

---

## 📖 핵심 기능 2 데모 방법 (RAG 매뉴얼 챗봇)

1. 상단 탭 **"매뉴얼 챗봇"** 클릭
2. 장비 선택 (SEM, XRD, TEM 중 하나)
3. 우측 상단 **⚙️ 관리** 버튼 클릭
4. **[📝 데모 매뉴얼 등록]** 클릭 (내장 텍스트로 즉시 인덱싱)
5. 다음 예시 질문 입력:

```
SEM 측정 전 시료 준비 조건이 뭐야?
진공 펌핑 절차 알려줘
이미지 촬영할 때 가속전압은 어떻게 설정해?
```

6. 답변과 함께 하단의 **📚 참고 출처** 확인 (페이지, 청크 번호)

**PDF 업로드:** `⚙️ 관리 → 📄 PDF 업로드`로 실제 장비 매뉴얼 PDF 등록 가능

---

## 📁 프로젝트 구조

```
labflow/
├── backend/
│   ├── main.py                        # FastAPI 진입점
│   ├── database.py                    # DB 연결
│   ├── models.py                      # SQLAlchemy 모델
│   ├── routers/
│   │   ├── chat.py                    # 핵심 기능 1: LLM 예약 챗봇
│   │   ├── manuals.py                 # 핵심 기능 2: RAG 매뉴얼 API
│   │   ├── reservation.py             # 예약 CRUD + Google Calendar 연동
│   │   ├── logs.py, rooms.py, auth.py # 보조 기능
│   │   └── noshow.py, safety.py, gcal.py
│   ├── services/
│   │   ├── rag_service.py             # RAG 파이프라인 핵심
│   │   ├── pdf_loader.py              # PDF 추출 + 청크 분할
│   │   ├── embedding_service.py       # 임베딩 (OpenAI / Mock)
│   │   ├── vector_store_service.py    # FAISS (numpy 폴백)
│   │   └── google_calendar.py
│   ├── uploads/manuals/               # PDF 업로드 경로
│   ├── vectorstores/faiss/            # FAISS 인덱스 저장
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.jsx
│       └── components/
│           ├── ChatBot.jsx            # 핵심 기능 1 UI (슬롯 선택 포함)
│           ├── ManualChatBot.jsx      # 핵심 기능 2 UI (RAG + 업로드)
│           ├── Calendar.jsx
│           └── ...
├── docs/
│   ├── uml/
│   │   ├── feature1_llm_reservation.md    # 유스케이스 + 시퀀스 다이어그램
│   │   └── feature2_rag_manual_chatbot.md # 유스케이스 + 클래스 다이어그램
│   └── presentation/
│       └── final_demo_scenario.md         # 발표 데모 시나리오
└── README.md
```

---

## 📡 주요 API 엔드포인트

### 핵심 기능 1 — 자연어 예약 챗봇

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/v1/chat/` | 자연어 메시지 전송 → LLM 응답 + 슬롯 제안 |
| POST | `/api/v1/chat/confirm-slot` | 슬롯 선택 확정 → 예약 생성 |

### 핵심 기능 2 — RAG 매뉴얼 챗봇

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/v1/manuals/upload` | PDF 매뉴얼 업로드 + 인덱싱 |
| GET | `/api/v1/manuals/` | 등록된 매뉴얼 목록 |
| POST | `/api/v1/manuals/ask` | 매뉴얼 기반 Q&A (RAG) |
| POST | `/api/v1/manuals/demo` | 텍스트로 데모 매뉴얼 등록 |
| GET | `/api/v1/manuals/status` | RAG 시스템 상태 확인 |

### 예약 관리

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/v1/reservations/` | 전체 예약 목록 |
| POST | `/api/v1/reservations/` | 예약 직접 생성 |
| PATCH | `/api/v1/reservations/{id}` | 예약 상태 변경 |

---

## 🗺️ 향후 확장 기능 (최종발표 범위 외)

- [ ] 자동 사용 로그 고도화 (체크인/아웃 패턴 분석)
- [ ] 파일 동기화 (AWS S3 연동, 측정 결과 자동 업로드)
- [ ] AI 이미지 분석 (SEM/TEM 이미지 자동 분석)
- [ ] XRD 피크 자동 동정 (JCPDS 데이터베이스 연동)
- [ ] AI 스케줄 예측 (장비 이용률 기반 최적 예약 추천)
- [ ] 이메일/슬랙 알림 (예약 확인, 안전 교육 리마인드)
- [ ] 사용자 인증 강화 (JWT 기반, 권한별 접근 제어)
- [ ] 배포 (AWS / GCP)

---

## 👥 팀 정보

AI Capstone Design Project 2026 — 지도교수: [교수님 성함]

---

*LabFlow v0.3.0 — AI Capstone Design Project 2026 | Powered by Claude API + FAISS + RAG*
