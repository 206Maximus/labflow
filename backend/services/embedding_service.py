"""
services/embedding_service.py — 텍스트 임베딩 서비스

우선순위:
  1. OpenAI text-embedding-3-small (OPENAI_API_KEY 설정 시)
  2. Mock 임베딩 (RAG_MOCK_MODE=true 또는 API Key 없을 때)
     — hash 기반 결정론적 벡터 (차원: 1536)
     — 발표 데모용: 실제 유사도 검색은 안 되지만 파이프라인은 동작

환경변수:
  OPENAI_API_KEY      — OpenAI API 키
  EMBEDDING_MODEL     — 사용할 모델 (기본: text-embedding-3-small)
  RAG_MOCK_MODE       — true이면 Mock 모드 강제
"""

import os
import hashlib
import math
from typing import List

EMBEDDING_DIM = 1536
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")


def _is_mock_mode() -> bool:
    return (
        os.getenv("RAG_MOCK_MODE", "false").lower() == "true"
        or not os.getenv("OPENAI_API_KEY")
    )


# ─── Mock 임베딩 ─────────────────────────────────────────────────────────────────

def _mock_embed(text: str) -> List[float]:
    """
    텍스트 해시 기반 결정론적 임베딩 벡터.
    동일 텍스트 → 동일 벡터 (재현성 보장).
    실제 의미 유사도는 없지만 파이프라인 테스트에 사용.
    """
    # 여러 해시 시드를 조합해 1536차원 생성
    vec = []
    for seed in range(0, EMBEDDING_DIM, 32):
        h = hashlib.sha256(f"{seed}:{text}".encode()).digest()
        for byte in h:
            if len(vec) < EMBEDDING_DIM:
                # [-1, 1] 범위로 정규화
                vec.append((byte / 127.5) - 1.0)

    # 정규화 (unit vector)
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec[:EMBEDDING_DIM]]


# ─── OpenAI 임베딩 ───────────────────────────────────────────────────────────────

def _openai_embed(text: str) -> List[float]:
    try:
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        response = client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=text,
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"[embedding_service] OpenAI 오류 → Mock 폴백: {e}")
        return _mock_embed(text)


# ─── 공개 API ────────────────────────────────────────────────────────────────────

def embed_text(text: str) -> List[float]:
    """단일 텍스트 임베딩"""
    if _is_mock_mode():
        return _mock_embed(text)
    return _openai_embed(text)


def embed_texts(texts: List[str]) -> List[List[float]]:
    """배치 임베딩 (리스트)"""
    if _is_mock_mode():
        return [_mock_embed(t) for t in texts]

    # OpenAI 배치 처리 (최대 2048개)
    try:
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        # 청크 단위 배치 처리
        all_embeddings = []
        batch_size = 100
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            response = client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=batch,
            )
            all_embeddings.extend([item.embedding for item in response.data])
        return all_embeddings
    except Exception as e:
        print(f"[embedding_service] 배치 OpenAI 오류 → Mock 폴백: {e}")
        return [_mock_embed(t) for t in texts]


def get_embedding_dim() -> int:
    return EMBEDDING_DIM


def is_mock_mode() -> bool:
    return _is_mock_mode()
