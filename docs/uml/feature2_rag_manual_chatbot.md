# 유스케이스 명세서 — 핵심 기능 2: 장비 매뉴얼 기반 AI 질의응답 (RAG)

> LabFlow 최종발표용 UML 작성 가이드 (2026 AI Capstone Design Project)

---

## 1. 유스케이스 개요

| 항목 | 내용 |
|------|------|
| **유스케이스명** | 장비 매뉴얼 기반 AI 질의응답 (RAG Manual Chatbot) |
| **유스케이스 ID** | UC-02 |
| **주요 액터** | 연구자 (질의), 관리자 (매뉴얼 업로드) |
| **보조 액터** | PDF Loader, Embedding Service, FAISS Vector Store, LLM (Claude API) |
| **목적** | 연구자가 장비 관련 질문을 하면 AI가 등록된 매뉴얼 PDF에서 근거를 검색하고 출처 기반 답변을 생성한다 |

---

## 2. 액터 (Actors)

- **연구자 (Primary Actor)**: 장비 사용법/조건을 질문하는 사용자
- **관리자 (Admin)**: PDF 매뉴얼을 업로드하여 RAG 시스템에 등록
- **PDF Loader**: PyPDF로 PDF 텍스트 추출 및 청크 분할
- **Embedding Service**: OpenAI API 또는 Mock으로 텍스트 벡터화
- **FAISS Vector Store**: 임베딩 저장 및 유사도 검색
- **LLM (Claude API)**: 검색된 context 기반 자연어 답변 생성

---

## 3. 사전 조건 (Preconditions)

**매뉴얼 업로드 시:**
1. 관리자가 LabFlow에 로그인되어 있다.
2. 장비별 PDF 매뉴얼이 준비되어 있다 (또는 데모 텍스트 사용).

**질의응답 시:**
1. 해당 장비의 매뉴얼이 FAISS에 인덱싱되어 있다.
2. ANTHROPIC_API_KEY 또는 LLM_MOCK_MODE=true가 설정되어 있다.

---

## 4. 유스케이스 A — 매뉴얼 업로드 및 인덱싱

| 단계 | 액터 | 행동 |
|------|------|------|
| 1 | 관리자 | ManualChatBot UI에서 장비 선택 후 [PDF 업로드] 또는 [데모 매뉴얼 등록] 클릭 |
| 2 | 시스템 | `POST /api/v1/manuals/upload` 또는 `/demo` 호출 |
| 3 | PDF Loader | PDF 파일에서 페이지별 텍스트 추출 (pypdf) |
| 4 | PDF Loader | 텍스트를 800~1000자 청크로 분할 (150자 overlap) |
| 5 | Embedding Service | 청크별 임베딩 벡터 생성 (OpenAI 또는 Mock) |
| 6 | FAISS Vector Store | 임베딩을 FAISS 인덱스에 추가 및 저장 |
| 7 | DB | ManualDocument, ManualChunk 레코드 생성 |
| 8 | 시스템 | "✅ 매뉴얼 등록 완료" 응답 반환 |

---

## 5. 유스케이스 B — 질의응답 (Main Flow)

| 단계 | 액터 | 행동 |
|------|------|------|
| 1 | 연구자 | 장비 선택 (SEM, XRD, TEM 등) 후 질문 입력: "SEM 측정 전 시료 준비 조건이 뭐야?" |
| 2 | 시스템 | `POST /api/v1/manuals/ask` 호출 |
| 3 | Embedding Service | 질문 텍스트를 임베딩 벡터로 변환 |
| 4 | FAISS Vector Store | 해당 장비 인덱스에서 코사인 유사도 기반 top-k 청크 검색 |
| 5 | 시스템 | score_threshold 초과한 청크를 ManualChunk DB 레코드로 매핑 |
| 6 | LLM (Claude API) | `[매뉴얼 내용] + [질문]` 프롬프트로 답변 생성 |
| 7 | 시스템 | ManualQAHistory에 질문/답변/출처 저장 |
| 8 | 시스템 | 답변 + 출처(title, page, chunk_index) 반환 |
| 9 | 연구자 | 답변 및 참고 출처 확인 |

---

## 6. 대안 흐름 (Alternative Flows)

### A1 — 매뉴얼 미등록
- 5a. 해당 장비의 ManualDocument가 DB에 없는 경우
- "⚠️ XRD 장비의 매뉴얼이 아직 등록되지 않았습니다" 반환
- 관리자에게 업로드 요청 안내

### A2 — 근거 미발견 (threshold 미달)
- 5a. 검색된 청크의 유사도 점수가 모두 threshold(0.3) 미만인 경우
- "매뉴얼에서 충분한 근거를 찾지 못했습니다. 더 구체적인 키워드로 질문해주세요" 반환

### A3 — Mock 임베딩 모드
- 3a. OPENAI_API_KEY 미설정 또는 RAG_MOCK_MODE=true인 경우
- 해시 기반 결정론적 Mock 임베딩 사용 (파이프라인 동작은 동일)
- 응답에 "Mock 임베딩 모드" 표시

### A4 — LLM Mock 모드
- 6a. ANTHROPIC_API_KEY 미설정 또는 LLM_MOCK_MODE=true인 경우
- 검색된 청크 텍스트를 요약하여 반환 (실제 LLM 없이)
- 응답에 "Mock 모드" 표시

### A5 — PDF 텍스트 추출 실패
- 3a. 스캔된 이미지 PDF 또는 손상된 파일인 경우
- HTTP 422 Unprocessable Entity 반환
- 관리자에게 텍스트 레이어가 있는 PDF 사용 권고

---

## 7. 사후 조건 (Postconditions)

**업로드 성공 시:**
- ManualDocument, ManualChunk 레코드 DB 생성
- FAISS 인덱스 파일 저장 (`{FAISS_INDEX_DIR}/{equipment_name}/index.faiss`)

**질의응답 성공 시:**
- ManualQAHistory 레코드 DB 저장
- 연구자가 답변과 출처(제목, 페이지, 청크 번호)를 확인

---

## 8. 액티비티 다이어그램 단계 목록

### 8-A: 매뉴얼 업로드 흐름
```
[시작: 관리자 PDF 업로드]
  ↓
파일 저장 (uploads/manuals/)
  ↓
PDF 텍스트 추출 (pypdf)
  ↓
[추출 성공?] ──No──> HTTP 422 반환
     ↓Yes
청크 분할 (800~1000자, 150자 overlap)
  ↓
배치 임베딩 생성 (OpenAI / Mock)
  ↓
FAISS 인덱스에 벡터 추가 및 저장
  ↓
ManualDocument + ManualChunk DB 저장
  ↓
업로드 완료 응답 (chunk_count 포함)
  ↓
[종료]
```

### 8-B: 질의응답 흐름
```
[시작: 연구자 질문 입력]
  ↓
질문 임베딩 생성
  ↓
FAISS 유사도 검색 (top-k)
  ↓
[결과 있음?] ──No──> "근거 없음" 반환
     ↓Yes
score >= threshold 청크 필터링
  ↓
[충분한 청크?] ──No──> "관련 내용 부족" 반환
     ↓Yes
Context 구성 (청크 텍스트 + 출처)
  ↓
LLM 호출 (Claude API / Mock)
  ↓
ManualQAHistory DB 저장
  ↓
답변 + 출처 목록 반환
  ↓
[종료]
```

---

## 9. 클래스 다이어그램 구성 요소

```
ManualsRouter
  + upload_manual(equipment_name, title, file, db) : ManualResponse
  + get_manuals(equipment_name, db) : List[ManualResponse]
  + ask_manual(request: AskRequest, db) : AskResponse
  + register_demo_manual(request: DemoManualRequest, db) : ManualResponse
  + rag_status() : dict

RagService
  + index_manual(db, equipment_name, title, filename, file_path) : ManualDocument
  + answer_question(db, equipment_name, question, user_id, top_k, threshold) : dict
  + list_manuals(db, equipment_name) : List[ManualDocument]
  - _generate_answer(question, context, equipment_name) : str

PdfLoader
  + extract_text_from_pdf(file_path) : List[(page_num, text)]
  + split_into_chunks(pages, chunk_size, overlap) : List[dict]
  + load_and_chunk_pdf(file_path, chunk_size, overlap) : List[dict]
  + load_and_chunk_text(text, chunk_size, overlap) : List[dict]

EmbeddingService
  + embed_text(text) : List[float]
  + embed_texts(texts) : List[List[float]]
  + get_embedding_dim() : int
  + is_mock_mode() : bool
  - _mock_embed(text) : List[float]          // hash-based 결정론적 벡터
  - _openai_embed(text) : List[float]

VectorStoreService
  + add_vectors(equipment_name, vectors) : List[int]
  + search_vectors(equipment_name, query_vector, top_k, threshold) : List[(int, float)]
  + delete_index(equipment_name) : None
  + get_index_size(equipment_name) : int
  - _load_faiss_index(equipment_name) : FAISSIndex | NumpyVectorStore
  - _save_index(equipment_name, index) : None

NumpyVectorStore                             // FAISS 미설치 시 폴백
  + add(vectors) : List[int]
  + search(query, top_k) : (scores, ids)
  + ntotal() : int

ManualDocument (DB Model)
  + id: int
  + equipment_name: str
  + title: str
  + filename: str
  + file_path: str
  + chunk_count: int
  + uploaded_at: DateTime
  → chunks: List[ManualChunk]

ManualChunk (DB Model)
  + id: int
  + manual_document_id: int
  + equipment_name: str
  + chunk_index: int
  + page_number: int
  + content: str
  + faiss_index_key: int
  + created_at: DateTime

ManualQAHistory (DB Model)
  + id: int
  + user_id: int
  + equipment_name: str
  + question: str
  + answer: str
  + sources_json: str     // JSON array
  + created_at: DateTime
```

### 관계
- `ManualsRouter` → delegates → `RagService`
- `RagService` → uses → `PdfLoader`, `EmbeddingService`, `VectorStoreService`
- `RagService` → reads/writes → `ManualDocument`, `ManualChunk`, `ManualQAHistory`
- `EmbeddingService` → calls → `OpenAI Embeddings API` (or `NumpyMockEmbed`)
- `VectorStoreService` → uses → `FAISS` (or `NumpyVectorStore` fallback)
- `RagService` → calls → `Claude API` (or Mock LLM)

---

## 10. 시퀀스 다이어그램 객체/메시지 흐름

### 10-A: 매뉴얼 업로드

```
관리자          ManualChatBot.jsx    FastAPI(manuals)   PdfLoader    EmbeddingService   VectorStore   DB
  │                  │                    │                │               │               │           │
  │──PDF선택──>      │                    │                │               │               │           │
  │                  │──POST /upload──>   │                │               │               │           │
  │                  │                    │──extract_text──>               │               │           │
  │                  │                    │<──[(page,text)]│               │               │           │
  │                  │                    │──split_chunks─>                │               │           │
  │                  │                    │<──[chunks]     │               │               │           │
  │                  │                    │──embed_texts────────────────>  │               │           │
  │                  │                    │<──[vectors]─────────────────   │               │           │
  │                  │                    │──add_vectors───────────────────────────────>   │           │
  │                  │                    │<──[faiss_ids]──────────────────────────────    │           │
  │                  │                    │──INSERT ManualDocument+Chunks──────────────────────────>   │
  │                  │<──{chunk_count}    │                │               │               │           │
  │<──"등록완료"      │                   │                │               │               │           │
```

### 10-B: 질의응답

```
연구자          ManualChatBot.jsx    FastAPI(manuals)   EmbeddingService   VectorStore   DB     Claude API
  │                  │                    │                  │               │           │          │
  │──질문입력──>     │                    │                  │               │           │          │
  │                  │──POST /ask──>      │                  │               │           │          │
  │                  │                    │──embed_text──────>               │           │          │
  │                  │                    │<──query_vector──                 │           │          │
  │                  │                    │──search(query)────────────────>  │           │          │
  │                  │                    │<──[(faiss_key, score)]─────────  │           │          │
  │                  │                    │──SELECT ManualChunk WHERE faiss_index_key──────────>    │
  │                  │                    │<──[chunks]─────────────────────────────────           │
  │                  │                    │──build context from chunks       │           │          │
  │                  │                    │──[context+question]──────────────────────────────────> │
  │                  │                    │<──answer─────────────────────────────────────────────  │
  │                  │                    │──INSERT ManualQAHistory────────────────────────────>    │
  │                  │<──{answer,sources} │                  │               │           │          │
  │<──답변+출처표시   │                   │                  │               │           │          │
```

---

## 11. 구현 파일 매핑

| UML 요소 | 실제 파일 |
|----------|-----------|
| ManualsRouter | `backend/routers/manuals.py` |
| RagService | `backend/services/rag_service.py` |
| PdfLoader | `backend/services/pdf_loader.py` |
| EmbeddingService | `backend/services/embedding_service.py` |
| VectorStoreService | `backend/services/vector_store_service.py` |
| NumpyVectorStore | `backend/services/vector_store_service.py:NumpyVectorStore` |
| ManualDocument | `backend/models.py:ManualDocument` |
| ManualChunk | `backend/models.py:ManualChunk` |
| ManualQAHistory | `backend/models.py:ManualQAHistory` |
| ManualChatBot UI | `frontend/src/components/ManualChatBot.jsx` |

---

## 12. RAG 파이프라인 파라미터 요약

| 파라미터 | 기본값 | 환경변수 |
|----------|--------|----------|
| Chunk Size | 1000자 | — |
| Chunk Overlap | 150자 | — |
| Embedding Model | text-embedding-3-small | `EMBEDDING_MODEL` |
| Embedding Dim | 1536 | — |
| FAISS Index Dir | `./vectorstores/faiss` | `FAISS_INDEX_DIR` |
| Top-K 검색 | 5 | `RAG_TOP_K` |
| Score Threshold | 0.3 | `RAG_SCORE_THRESHOLD` |
| Mock Mode | false | `RAG_MOCK_MODE` |
