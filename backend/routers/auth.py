"""
routers/auth.py — 회원가입 / 로그인 / 내 정보 API

엔드포인트:
  POST /api/v1/auth/register  — 회원가입 (이름, 이메일, 비밀번호)
  POST /api/v1/auth/login     — 로그인 → JWT 토큰 반환
  POST /api/v1/auth/login/form — OAuth2 폼 로그인 (Swagger UI 전용)
  GET  /api/v1/auth/me        — 현재 로그인 사용자 정보
"""

import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional
import logging

from database import get_db
from models import User
from auth_utils import (
    hash_password,
    verify_password,
    create_access_token,
    get_required_user,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ─── Pydantic 스키마 ────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    name: str
    email: str
    role: str
    safety_certified: bool


class MeResponse(BaseModel):
    user_id: int
    name: str
    email: str
    role: str
    safety_certified: bool
    safety_certified_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# ─── 엔드포인트 ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    """
    회원가입 — 가입 즉시 JWT 토큰 반환 (바로 로그인 상태)
    - 이메일 중복 체크
    - 비밀번호 bcrypt 해싱
    - 최초 가입자는 researcher 역할
    """
    if len(data.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="비밀번호는 6자 이상이어야 합니다."
        )

    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 사용 중인 이메일입니다."
        )

    user = User(
        name=data.name,
        email=data.email,
        hashed_password=hash_password(data.password),
        role="researcher",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    logger.info("신규 회원가입: %s (%s)", user.name, user.email)

    token = create_access_token({
        "sub":   user.id,
        "email": user.email,
        "role":  user.role,
    })

    return TokenResponse(
        access_token=token,
        user_id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        safety_certified=user.safety_certified or False,
    )


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    """JSON 바디 로그인 (React 프론트엔드용)"""
    user = db.query(User).filter(User.email == data.email).first()

    if not user or not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다."
        )

    if not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일 또는 비밀번호가 올바르지 않습니다."
        )

    logger.info("로그인 성공: %s (%s)", user.name, user.email)

    token = create_access_token({
        "sub":   user.id,
        "email": user.email,
        "role":  user.role,
    })

    return TokenResponse(
        access_token=token,
        user_id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        safety_certified=user.safety_certified or False,
    )


@router.post("/login/form", response_model=TokenResponse)
def login_form(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """OAuth2 폼 로그인 — Swagger UI /docs 에서 Authorize 버튼용"""
    return login(LoginRequest(email=form.username, password=form.password), db)


@router.get("/me", response_model=MeResponse)
def get_me(
    current: dict = Depends(get_required_user),
    db: Session = Depends(get_db)
):
    """현재 로그인한 사용자 정보 반환"""
    user = db.query(User).filter(User.id == current["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

    return MeResponse(
        user_id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        safety_certified=user.safety_certified or False,
        safety_certified_at=user.safety_certified_at,
        created_at=user.created_at,
    )
