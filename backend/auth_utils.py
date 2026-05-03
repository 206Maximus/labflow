"""
auth_utils.py — JWT 생성/검증 및 비밀번호 해싱 유틸리티

사용 라이브러리:
  - passlib[bcrypt]  : 비밀번호 해싱
  - python-jose[cryptography] : JWT 생성/파싱

환경변수 (.env):
  JWT_SECRET_KEY  : JWT 서명 키 (필수, 충분히 긴 랜덤 문자열 권장)
  JWT_ALGORITHM   : 알고리즘 (기본 HS256)
  ACCESS_TOKEN_EXPIRE_MINUTES : 토큰 유효 시간 (기본 1440 = 24h)
"""

import os
from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

# ─── 설정 ────────────────────────────────────────────────────────────────────

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "labflow-dev-secret-change-in-production")
ALGORITHM  = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

# ─── 비밀번호 해싱 ────────────────────────────────────────────────────────────

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    """평문 비밀번호 → bcrypt 해시"""
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """입력 비밀번호와 해시 비교"""
    return pwd_context.verify(plain, hashed)


# ─── JWT ─────────────────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """JWT 액세스 토큰 생성"""
    payload = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    payload.update({"exp": expire})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """JWT 토큰 파싱 — 실패 시 None 반환"""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


# ─── FastAPI 의존성 ───────────────────────────────────────────────────────────

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login/form", auto_error=False)


def get_current_user_id(token: str = Depends(oauth2_scheme)) -> Optional[int]:
    """
    Authorization: Bearer <token> 헤더에서 user_id 추출.
    토큰이 없거나 만료된 경우 None 반환 (soft check).
    엄격하게 막으려면 get_required_user_id 사용.
    """
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    return payload.get("sub")


def get_required_user(token: str = Depends(oauth2_scheme)):
    """
    인증 필수 의존성 — 토큰 없거나 유효하지 않으면 401.
    라우터에서 Depends(get_required_user) 로 사용.
    반환값: {"user_id": int, "email": str, "role": str}
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="로그인이 필요합니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="토큰이 유효하지 않거나 만료되었습니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {
        "user_id": payload.get("sub"),
        "email":   payload.get("email"),
        "role":    payload.get("role"),
    }
