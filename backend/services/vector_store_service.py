"""
services/vector_store_service.py — FAISS 기반 벡터 저장소

장비별로 별도 FAISS index를 관리합니다.
저장 경로: {FAISS_INDEX_DIR}/{equipment_name}/index.faiss
           {FAISS_INDEX_DIR}/{equipment_name}/index.pkl  (메타데이터)

FAISS 미설치 시 numpy 코사인 유사도로 자동 폴백.

환경변수:
  FAISS_INDEX_DIR — FAISS 인덱스 저장 루트 (기본: ./vectorstores/faiss)
"""

import os
import pickle
import math
from typing import List, Tuple, Optional
from pathlib import Path

FAISS_INDEX_DIR = os.getenv("FAISS_INDEX_DIR", "./vectorstores/faiss")


# ─── 경로 헬퍼 ──────────────────────────────────────────────────────────────────

def _index_dir(equipment_name: str) -> Path:
    d = Path(FAISS_INDEX_DIR) / equipment_name.upper()
    d.mkdir(parents=True, exist_ok=True)
    return d


def _index_path(equipment_name: str) -> Path:
    return _index_dir(equipment_name) / "index.faiss"


def _meta_path(equipment_name: str) -> Path:
    return _index_dir(equipment_name) / "index.pkl"


# ─── numpy 폴백 구현 ─────────────────────────────────────────────────────────────

class NumpyVectorStore:
    """FAISS 미설치 시 numpy 코사인 유사도 검색"""

    def __init__(self, dim: int):
        self.dim = dim
        self.vectors: List[List[float]] = []

    def add(self, vectors: List[List[float]]) -> List[int]:
        start = len(self.vectors)
        self.vectors.extend(vectors)
        return list(range(start, len(self.vectors)))

    def search(self, query: List[float], top_k: int) -> Tuple[List[float], List[int]]:
        if not self.vectors:
            return [], []

        # 코사인 유사도
        def cosine(a, b):
            dot = sum(x * y for x, y in zip(a, b))
            norm_a = math.sqrt(sum(x * x for x in a)) or 1e-9
            norm_b = math.sqrt(sum(x * x for x in b)) or 1e-9
            return dot / (norm_a * norm_b)

        scores = [(cosine(query, v), i) for i, v in enumerate(self.vectors)]
        scores.sort(reverse=True)
        top = scores[:top_k]
        return [s for s, _ in top], [i for _, i in top]

    def ntotal(self) -> int:
        return len(self.vectors)


# ─── FAISS 로드/저장 ─────────────────────────────────────────────────────────────

def _load_faiss_index(equipment_name: str):
    """기존 FAISS 인덱스 로드 (없으면 새로 생성)"""
    ipath = _index_path(equipment_name)

    try:
        import faiss
        if ipath.exists():
            return faiss.read_index(str(ipath))
        from services.embedding_service import get_embedding_dim
        index = faiss.IndexFlatIP(get_embedding_dim())  # Inner Product (코사인 유사도용)
        return index
    except ImportError:
        pass

    # numpy 폴백
    mpath = _meta_path(equipment_name)
    if mpath.exists():
        with open(mpath, "rb") as f:
            store = pickle.load(f)
            if isinstance(store, NumpyVectorStore):
                return store
    from services.embedding_service import get_embedding_dim
    return NumpyVectorStore(get_embedding_dim())


def _save_index(equipment_name: str, index) -> None:
    try:
        import faiss
        if isinstance(index, faiss.Index):
            faiss.write_index(index, str(_index_path(equipment_name)))
            return
    except ImportError:
        pass

    # numpy 폴백 저장
    with open(_meta_path(equipment_name), "wb") as f:
        pickle.dump(index, f)


# ─── 공개 API ────────────────────────────────────────────────────────────────────

def add_vectors(
    equipment_name: str,
    vectors: List[List[float]],
) -> List[int]:
    """
    벡터를 인덱스에 추가.
    반환: 추가된 벡터들의 인덱스 번호 리스트
    """
    index = _load_faiss_index(equipment_name)

    try:
        import faiss
        import numpy as np
        if isinstance(index, faiss.Index):
            arr = np.array(vectors, dtype="float32")
            # 코사인 유사도를 위해 정규화
            faiss.normalize_L2(arr)
            start_id = index.ntotal
            index.add(arr)
            _save_index(equipment_name, index)
            return list(range(start_id, index.ntotal))
    except ImportError:
        pass

    # numpy 폴백
    ids = index.add(vectors)
    _save_index(equipment_name, index)
    return ids


def search_vectors(
    equipment_name: str,
    query_vector: List[float],
    top_k: int = 5,
    score_threshold: float = 0.0,
) -> List[Tuple[int, float]]:
    """
    유사 벡터 검색.
    반환: [(faiss_index_key, score), ...] (score 내림차순)
    """
    index = _load_faiss_index(equipment_name)

    try:
        import faiss
        import numpy as np
        if isinstance(index, faiss.Index):
            if index.ntotal == 0:
                return []
            arr = np.array([query_vector], dtype="float32")
            faiss.normalize_L2(arr)
            k = min(top_k, index.ntotal)
            scores, ids = index.search(arr, k)
            results = [
                (int(ids[0][i]), float(scores[0][i]))
                for i in range(k)
                if scores[0][i] >= score_threshold
            ]
            return results
    except ImportError:
        pass

    # numpy 폴백
    if isinstance(index, NumpyVectorStore):
        scores_list, ids_list = index.search(query_vector, top_k)
        return [
            (ids_list[i], scores_list[i])
            for i in range(len(ids_list))
            if scores_list[i] >= score_threshold
        ]

    return []


def delete_index(equipment_name: str) -> None:
    """장비 인덱스 삭제 (매뉴얼 재업로드 시)"""
    ipath = _index_path(equipment_name)
    mpath = _meta_path(equipment_name)
    if ipath.exists():
        ipath.unlink()
    if mpath.exists():
        mpath.unlink()


def get_index_size(equipment_name: str) -> int:
    """인덱스에 저장된 벡터 수"""
    try:
        index = _load_faiss_index(equipment_name)
        if hasattr(index, "ntotal"):
            return index.ntotal()
    except Exception:
        pass
    return 0
