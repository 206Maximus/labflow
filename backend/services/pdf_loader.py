"""
services/pdf_loader.py — PDF 텍스트 추출 및 청크 분할

지원 라이브러리 (우선순위):
  1. pypdf (권장)
  2. PyPDF2 (레거시)
  3. pdfplumber (표/레이아웃 정밀 추출)
  4. Mock (PDF 없이 텍스트 직접 입력 시)
"""

import os
import re
from typing import List, Tuple

# ─── PDF 추출 함수 ───────────────────────────────────────────────────────────────

def extract_text_from_pdf(file_path: str) -> List[Tuple[int, str]]:
    """
    PDF 파일에서 페이지별 텍스트 추출.
    반환: [(page_number, text), ...]  (1-indexed)
    """
    pages = []

    # 1순위: pypdf
    try:
        from pypdf import PdfReader
        reader = PdfReader(file_path)
        for i, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if text.strip():
                pages.append((i + 1, text))
        if pages:
            return pages
    except ImportError:
        pass
    except Exception as e:
        print(f"[pdf_loader] pypdf 오류: {e}")

    # 2순위: PyPDF2
    try:
        import PyPDF2
        with open(file_path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for i, page in enumerate(reader.pages):
                text = page.extract_text() or ""
                if text.strip():
                    pages.append((i + 1, text))
        if pages:
            return pages
    except ImportError:
        pass
    except Exception as e:
        print(f"[pdf_loader] PyPDF2 오류: {e}")

    # 3순위: pdfplumber
    try:
        import pdfplumber
        with pdfplumber.open(file_path) as pdf:
            for i, page in enumerate(pdf.pages):
                text = page.extract_text() or ""
                if text.strip():
                    pages.append((i + 1, text))
        if pages:
            return pages
    except ImportError:
        pass
    except Exception as e:
        print(f"[pdf_loader] pdfplumber 오류: {e}")

    # 모두 실패 시 빈 목록 반환
    print(f"[pdf_loader] 경고: '{file_path}' 에서 텍스트를 추출하지 못했습니다.")
    return []


# ─── 청크 분할 ────────────────────────────────────────────────────────────────────

def split_into_chunks(
    pages: List[Tuple[int, str]],
    chunk_size: int = 1000,
    overlap: int = 150,
) -> List[dict]:
    """
    페이지 텍스트를 chunk_size 문자 단위로 분할.
    overlap: 앞 청크와 겹치는 문자 수 (문맥 유지용)

    반환: [{"chunk_index": int, "page_number": int, "content": str}, ...]
    """
    chunks = []
    chunk_index = 0

    for page_num, text in pages:
        # 불필요한 공백 정리
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = re.sub(r'[ \t]+', ' ', text).strip()

        start = 0
        while start < len(text):
            end = start + chunk_size
            chunk_text = text[start:end]

            # 단어 경계에서 자르기 (마지막 공백 위치)
            if end < len(text):
                last_space = chunk_text.rfind(' ')
                if last_space > chunk_size * 0.7:  # 최소 70% 지점 이후
                    end = start + last_space + 1
                    chunk_text = text[start:end]

            chunk_text = chunk_text.strip()
            if chunk_text:
                chunks.append({
                    "chunk_index": chunk_index,
                    "page_number": page_num,
                    "content": chunk_text,
                })
                chunk_index += 1

            start = end - overlap  # overlap만큼 되돌아가서 시작
            if start <= 0:
                start = end  # 무한루프 방지

    return chunks


# ─── 통합 처리 함수 ──────────────────────────────────────────────────────────────

def load_and_chunk_pdf(
    file_path: str,
    chunk_size: int = 1000,
    overlap: int = 150,
) -> List[dict]:
    """
    PDF 로드 → 텍스트 추출 → 청크 분할 원스톱 함수.
    반환: [{"chunk_index", "page_number", "content"}, ...]
    """
    pages = extract_text_from_pdf(file_path)
    if not pages:
        return []
    return split_into_chunks(pages, chunk_size=chunk_size, overlap=overlap)


def load_and_chunk_text(
    text: str,
    chunk_size: int = 1000,
    overlap: int = 150,
) -> List[dict]:
    """
    일반 텍스트를 직접 청크로 분할 (Mock/테스트용).
    """
    return split_into_chunks([(1, text)], chunk_size=chunk_size, overlap=overlap)
