"""
routers/manuals.py — AI 매뉴얼 챗봇 (RAG) API

엔드포인트:
  POST /api/v1/manuals/upload   — PDF 매뉴얼 업로드 및 인덱싱
  GET  /api/v1/manuals          — 등록된 매뉴얼 목록 조회
  POST /api/v1/manuals/ask      — 장비 매뉴얼 기반 Q&A
  POST /api/v1/manuals/demo     — 데모용 샘플 매뉴얼 등록 (PDF 없이)
"""

import os
import json
import shutil
from pathlib import Path
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import ManualDocument, ManualChunk, ManualQAHistory
from services.rag_service import index_manual, answer_question, list_manuals
from services.pdf_loader import load_and_chunk_text
from services.embedding_service import embed_texts, is_mock_mode
from services.vector_store_service import add_vectors, delete_index

router = APIRouter(prefix="/manuals", tags=["manuals"])

MANUAL_UPLOAD_DIR = Path(os.getenv("MANUAL_UPLOAD_DIR", "./uploads/manuals"))
MANUAL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# ─── Pydantic 스키마 ────────────────────────────────────────────────────────────

class ManualResponse(BaseModel):
    id: int
    equipment_name: str
    title: str
    filename: str
    chunk_count: int
    uploaded_at: datetime

    class Config:
        from_attributes = True


class AskRequest(BaseModel):
    equipment_name: str
    question: str
    user_id: Optional[int] = None
    top_k: Optional[int] = 5


class SourceInfo(BaseModel):
    title: str
    page_number: Optional[int]
    chunk_index: int
    content_preview: str
    score: float


class AskResponse(BaseModel):
    equipment_name: str
    question: str
    answer: str
    sources: List[SourceInfo]
    mock_mode: bool


class DemoManualRequest(BaseModel):
    equipment_name: str
    title: str
    content: str   # 직접 입력할 텍스트 (PDF 없이 테스트용)


# ─── PDF 업로드 엔드포인트 ───────────────────────────────────────────────────────

@router.post("/upload", response_model=ManualResponse, status_code=status.HTTP_201_CREATED)
async def upload_manual(
    equipment_name: str = Form(..., description="장비명 (예: SEM, XRD, TEM)"),
    title: str = Form(..., description="매뉴얼 제목"),
    file: UploadFile = File(..., description="PDF 파일"),
    db: Session = Depends(get_db),
):
    """
    PDF 매뉴얼 업로드 → 텍스트 추출 → 청크 분할 → 임베딩 → FAISS 저장
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드 가능합니다.")

    # 파일 저장
    safe_equip = equipment_name.upper().replace("/", "_")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{safe_equip}_{timestamp}_{file.filename}"
    file_path = MANUAL_UPLOAD_DIR / filename

    try:
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"파일 저장 실패: {str(e)}")

    # 인덱싱
    try:
        doc = index_manual(
            db=db,
            equipment_name=equipment_name,
            title=title,
            filename=filename,
            file_path=str(file_path),
        )
    except ValueError as e:
        # PDF 텍스트 추출 실패 시 파일 삭제 후 오류 반환
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"인덱싱 실패: {str(e)}")

    return doc


# ─── 매뉴얼 목록 ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ManualResponse])
def get_manuals(
    equipment_name: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """등록된 매뉴얼 목록 조회 (장비 필터 선택)"""
    return list_manuals(db, equipment_name)


# ─── Q&A 엔드포인트 ──────────────────────────────────────────────────────────────

@router.post("/ask", response_model=AskResponse)
def ask_manual(request: AskRequest, db: Session = Depends(get_db)):
    """
    장비 매뉴얼 기반 질의응답 (RAG)
    """
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="질문을 입력해주세요.")

    result = answer_question(
        db=db,
        equipment_name=request.equipment_name,
        question=request.question,
        user_id=request.user_id,
        top_k=request.top_k or 5,
    )

    return AskResponse(
        equipment_name=request.equipment_name,
        question=request.question,
        answer=result["answer"],
        sources=[SourceInfo(**s) for s in result["sources"]],
        mock_mode=result["mock_mode"],
    )


# ─── 데모용 텍스트 매뉴얼 등록 ───────────────────────────────────────────────────

@router.post("/demo", response_model=ManualResponse, status_code=status.HTTP_201_CREATED)
def register_demo_manual(request: DemoManualRequest, db: Session = Depends(get_db)):
    """
    PDF 없이 텍스트로 데모 매뉴얼 등록.
    발표 데모 또는 테스트용.
    """
    equip_upper = request.equipment_name.upper()

    # 기존 인덱스 삭제
    delete_index(equip_upper)

    # 텍스트 → 청크
    chunks_data = load_and_chunk_text(request.content)
    if not chunks_data:
        raise HTTPException(status_code=422, detail="텍스트가 너무 짧습니다.")

    # ManualDocument 생성
    filename = f"demo_{equip_upper}_{datetime.now().strftime('%Y%m%d')}.txt"
    doc = ManualDocument(
        equipment_name=equip_upper,
        title=request.title,
        filename=filename,
        file_path=f"[DEMO] {filename}",
        chunk_count=len(chunks_data),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # 임베딩 및 FAISS 저장
    texts = [c["content"] for c in chunks_data]
    vectors = embed_texts(texts)
    faiss_ids = add_vectors(equip_upper, vectors)

    for chunk, faiss_id in zip(chunks_data, faiss_ids):
        db_chunk = ManualChunk(
            manual_document_id=doc.id,
            equipment_name=equip_upper,
            chunk_index=chunk["chunk_index"],
            page_number=chunk.get("page_number"),
            content=chunk["content"],
            faiss_index_key=faiss_id,
        )
        db.add(db_chunk)

    db.commit()
    return doc


# ─── QA 이력 조회 ────────────────────────────────────────────────────────────────

@router.get("/history/{equipment_name}")
def get_qa_history(
    equipment_name: str,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """특정 장비의 Q&A 이력 조회"""
    records = db.query(ManualQAHistory).filter(
        ManualQAHistory.equipment_name == equipment_name.upper()
    ).order_by(ManualQAHistory.created_at.desc()).limit(limit).all()

    return [
        {
            "id": r.id,
            "equipment_name": r.equipment_name,
            "question": r.question,
            "answer": r.answer[:200] + "..." if len(r.answer) > 200 else r.answer,
            "sources": json.loads(r.sources_json) if r.sources_json else [],
            "created_at": r.created_at.isoformat(),
        }
        for r in records
    ]


# ─── 상태 확인 ───────────────────────────────────────────────────────────────────

@router.get("/status")
def rag_status():
    """RAG 시스템 상태 및 설정 확인"""
    return {
        "rag_mock_mode": is_mock_mode(),
        "embedding_model": os.getenv("EMBEDDING_MODEL", "text-embedding-3-small"),
        "faiss_index_dir": os.getenv("FAISS_INDEX_DIR", "./vectorstores/faiss"),
        "manual_upload_dir": str(MANUAL_UPLOAD_DIR),
        "openai_key_set": bool(os.getenv("OPENAI_API_KEY")),
        "anthropic_key_set": bool(os.getenv("ANTHROPIC_API_KEY")),
    }
