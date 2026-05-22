"""
services/rag_service.py — RAG 파이프라인 핵심 서비스

흐름:
  [PDF 업로드] → pdf_loader → embedding_service → vector_store_service → DB 저장
  [질문 입력] → embedding → vector_store 검색 → LLM (context + question) → 답변 + 출처

환경변수:
  ANTHROPIC_API_KEY  — LLM 답변 생성용
  OPENAI_API_KEY     — 임베딩 생성용
  RAG_MOCK_MODE      — true 시 전체 Mock 모드
  LLM_MOCK_MODE      — true 시 LLM 단독 Mock
"""

import os
import json
from typing import List, Optional, Tuple
from sqlalchemy.orm import Session

from models import ManualDocument, ManualChunk, ManualQAHistory
from services.pdf_loader import load_and_chunk_pdf
from services.embedding_service import embed_text, embed_texts, is_mock_mode as emb_mock
from services.vector_store_service import add_vectors, search_vectors, delete_index

SCORE_THRESHOLD = float(os.getenv("RAG_SCORE_THRESHOLD", "0.3"))
TOP_K = int(os.getenv("RAG_TOP_K", "5"))


# ─── Mock 모드 확인 ──────────────────────────────────────────────────────────────

def _llm_mock() -> bool:
    return (
        os.getenv("LLM_MOCK_MODE", "false").lower() == "true"
        or not os.getenv("ANTHROPIC_API_KEY")
    )


# ─── PDF 업로드 → 인덱싱 ─────────────────────────────────────────────────────────

def index_manual(
    db: Session,
    equipment_name: str,
    title: str,
    filename: str,
    file_path: str,
    chunk_size: int = 1000,
    overlap: int = 150,
) -> ManualDocument:
    """
    PDF 매뉴얼을 청크로 분할하고 임베딩하여 FAISS에 저장.
    ManualDocument, ManualChunk 레코드를 DB에 생성.
    """
    # 기존 인덱스 삭제 (재업로드 시 갱신)
    delete_index(equipment_name)

    # PDF → 청크
    chunks_data = load_and_chunk_pdf(file_path, chunk_size=chunk_size, overlap=overlap)

    if not chunks_data:
        # 텍스트 추출 실패 시 빈 문서 생성 후 예외
        raise ValueError(f"PDF에서 텍스트를 추출하지 못했습니다: {filename}")

    # ManualDocument 생성
    doc = ManualDocument(
        equipment_name=equipment_name.upper(),
        title=title,
        filename=filename,
        file_path=file_path,
        chunk_count=len(chunks_data),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # 임베딩 배치 생성
    texts = [c["content"] for c in chunks_data]
    vectors = embed_texts(texts)

    # FAISS에 벡터 추가
    faiss_ids = add_vectors(equipment_name.upper(), vectors)

    # ManualChunk 레코드 생성
    for i, (chunk, faiss_id) in enumerate(zip(chunks_data, faiss_ids)):
        db_chunk = ManualChunk(
            manual_document_id=doc.id,
            equipment_name=equipment_name.upper(),
            chunk_index=chunk["chunk_index"],
            page_number=chunk.get("page_number"),
            content=chunk["content"],
            faiss_index_key=faiss_id,
        )
        db.add(db_chunk)

    db.commit()
    return doc


# ─── 질문 → 검색 → 답변 ──────────────────────────────────────────────────────────

def answer_question(
    db: Session,
    equipment_name: str,
    question: str,
    user_id: Optional[int] = None,
    top_k: int = TOP_K,
    score_threshold: float = SCORE_THRESHOLD,
) -> dict:
    """
    RAG 파이프라인:
      1. 질문 임베딩
      2. FAISS 검색 (top-k chunks)
      3. threshold 미달 시 "근거 없음" 반환
      4. LLM에 context + question 전달
      5. 답변 + 출처 반환
      6. QA 이력 DB 저장

    반환:
      {
        "answer": str,
        "sources": [{"title", "page_number", "chunk_index", "content_preview"}],
        "mock_mode": bool,
      }
    """
    equip_upper = equipment_name.upper()

    # 1. 질문 임베딩
    query_vec = embed_text(question)

    # 2. 벡터 검색
    results = search_vectors(equip_upper, query_vec, top_k=top_k, score_threshold=score_threshold)

    # 3. chunk 조회
    retrieved_chunks = []
    for faiss_key, score in results:
        chunk = db.query(ManualChunk).filter(
            ManualChunk.equipment_name == equip_upper,
            ManualChunk.faiss_index_key == faiss_key,
        ).first()
        if chunk:
            retrieved_chunks.append((chunk, score))

    # Mock 모드에서 검색 결과가 없으면 DB에서 샘플 청크 직접 가져오기
    if not retrieved_chunks and emb_mock():
        sample_chunks = db.query(ManualChunk).filter(
            ManualChunk.equipment_name == equip_upper
        ).limit(top_k).all()
        retrieved_chunks = [(c, 0.5) for c in sample_chunks]

    # 4. 근거 없음 처리
    if not retrieved_chunks:
        # 해당 장비 매뉴얼 자체가 없는지 확인
        doc_count = db.query(ManualDocument).filter(
            ManualDocument.equipment_name == equip_upper
        ).count()
        if doc_count == 0:
            answer = (
                f"⚠️ {equipment_name} 장비의 매뉴얼이 아직 등록되지 않았습니다.\n"
                "관리자가 PDF 매뉴얼을 업로드하면 이 장비에 대한 질문에 답변드릴 수 있습니다."
            )
        else:
            answer = (
                f"📋 매뉴얼에서 '{question}'에 대한 충분한 근거를 찾지 못했습니다.\n"
                "더 구체적인 키워드로 다시 질문해주세요."
            )
        return {"answer": answer, "sources": [], "mock_mode": emb_mock()}

    # 5. context 구성
    context_parts = []
    sources = []
    for chunk, score in retrieved_chunks:
        doc = db.query(ManualDocument).filter(
            ManualDocument.id == chunk.manual_document_id
        ).first()
        doc_title = doc.title if doc else "알 수 없음"
        context_parts.append(
            f"[출처: {doc_title}, p.{chunk.page_number}, 청크 #{chunk.chunk_index}]\n"
            f"{chunk.content}"
        )
        sources.append({
            "title": doc_title,
            "page_number": chunk.page_number,
            "chunk_index": chunk.chunk_index,
            "content_preview": chunk.content[:120] + "..." if len(chunk.content) > 120 else chunk.content,
            "score": round(score, 4),
        })

    context = "\n\n---\n\n".join(context_parts)

    # 6. LLM 답변 생성
    answer = _generate_answer(question, context, equipment_name)

    # 7. QA 이력 저장
    qa = ManualQAHistory(
        user_id=user_id,
        equipment_name=equip_upper,
        question=question,
        answer=answer,
        sources_json=json.dumps(sources, ensure_ascii=False),
    )
    db.add(qa)
    db.commit()

    return {
        "answer": answer,
        "sources": sources,
        "mock_mode": emb_mock() or _llm_mock(),
    }


def _generate_answer(question: str, context: str, equipment_name: str) -> str:
    """LLM으로 context 기반 답변 생성"""

    # Mock 모드
    if _llm_mock():
        return (
            f"[Mock 모드] **{equipment_name}** 관련 질문: \"{question}\"\n\n"
            f"매뉴얼에서 다음 내용을 찾았습니다:\n\n"
            f"{context[:500]}{'...' if len(context) > 500 else ''}\n\n"
            "*(실제 서비스에서는 Claude API가 이 내용을 분석해 정확한 답변을 생성합니다)*"
        )

    # 실제 LLM 호출
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

        system_prompt = (
            f"당신은 대학 연구실의 {equipment_name} 장비 전문 AI 어시스턴트입니다.\n"
            "제공된 매뉴얼 내용(context)을 바탕으로 사용자 질문에 정확하고 안전하게 답변하세요.\n\n"
            "규칙:\n"
            "- context에 없는 내용은 추측하지 말고 '매뉴얼에서 찾을 수 없습니다'라고 말하세요.\n"
            "- 안전 관련 내용은 반드시 강조하세요.\n"
            "- 단계별 절차는 번호 목록으로 명확하게 표현하세요.\n"
            "- 답변 마지막에 참고 출처 정보를 간략히 언급하세요.\n"
            "- 한국어로 답변하세요."
        )

        user_message = (
            f"[매뉴얼 내용]\n{context}\n\n"
            f"[질문]\n{question}"
        )

        response = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=1024,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        return response.content[0].text

    except Exception as e:
        # LLM 실패 시 context 요약 반환
        return (
            f"⚠️ AI 답변 생성 중 오류 발생: {str(e)}\n\n"
            f"매뉴얼에서 찾은 관련 내용:\n\n{context[:800]}"
        )


# ─── 매뉴얼 목록 조회 ────────────────────────────────────────────────────────────

def list_manuals(db: Session, equipment_name: Optional[str] = None) -> List[ManualDocument]:
    query = db.query(ManualDocument)
    if equipment_name:
        query = query.filter(ManualDocument.equipment_name == equipment_name.upper())
    return query.order_by(ManualDocument.uploaded_at.desc()).all()
