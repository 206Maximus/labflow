"""Authentication routes for LabFlow."""

import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_utils import (
    create_access_token,
    create_login_payload,
    get_required_user,
    hash_password,
    verify_password,
)
from database import get_db
from models import GoogleAccount, User
from services.google_calendar import (
    GoogleOAuthError,
    exchange_code,
    get_configured_redirect_uri,
    get_auth_url,
    get_google_profile,
    get_oauth_diagnostics,
    upsert_google_user,
)
from services.login_tickets import consume_login_ticket

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


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
    google_connected: bool = False
    picture_url: Optional[str] = None


class MeResponse(BaseModel):
    user_id: int
    name: str
    email: str
    role: str
    safety_certified: bool
    safety_certified_at: Optional[datetime]
    google_connected: bool = False
    picture_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class GoogleAuthUrlResponse(BaseModel):
    auth_url: str


class GoogleCodeRequest(BaseModel):
    code: str
    redirect_uri: Optional[str] = None


class GoogleTicketRequest(BaseModel):
    ticket: str


def _google_login_state() -> str:
    return create_access_token(
        {"purpose": "google_login"},
        expires_delta=timedelta(minutes=10),
    )


def _token_response(user: User, db: Session) -> TokenResponse:
    account = db.query(GoogleAccount).filter(GoogleAccount.user_id == user.id).first()
    return TokenResponse(**create_login_payload(
        user,
        google_connected=bool(account and account.refresh_token_encrypted),
        picture_url=account.picture_url if account else None,
    ))


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    if len(data.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters.",
        )

    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is already registered.",
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

    logger.info("New user registered: %s (%s)", user.name, user.email)
    return _token_response(user, db)


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()

    if not user or not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email or password is incorrect.",
        )

    if not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email or password is incorrect.",
        )

    logger.info("Login succeeded: %s (%s)", user.name, user.email)
    return _token_response(user, db)


@router.post("/login/form", response_model=TokenResponse)
def login_form(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    return login(LoginRequest(email=form.username, password=form.password), db)


@router.get("/google/auth-url", response_model=GoogleAuthUrlResponse)
def google_auth_url():
    try:
        diagnostics = get_oauth_diagnostics()
        logger.warning(
            "Google login auth URL requested: redirect_uri=%s, client_id_present=%s, client_id_hint=%s, client_secret_present=%s",
            diagnostics["redirect_uri"],
            diagnostics["client_id_present"],
            diagnostics["client_id_hint"],
            diagnostics["client_secret_present"],
        )
        return GoogleAuthUrlResponse(
            auth_url=get_auth_url(
                state=_google_login_state(),
                redirect_uri=get_configured_redirect_uri(),
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/google/start")
def google_start():
    try:
        diagnostics = get_oauth_diagnostics()
        logger.warning(
            "Google login redirect start: redirect_uri=%s, client_id_present=%s, client_id_hint=%s, client_secret_present=%s",
            diagnostics["redirect_uri"],
            diagnostics["client_id_present"],
            diagnostics["client_id_hint"],
            diagnostics["client_secret_present"],
        )
        return RedirectResponse(
            url=get_auth_url(
                state=_google_login_state(),
                redirect_uri=get_configured_redirect_uri(),
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/google/code", response_model=TokenResponse)
def google_code_login(data: GoogleCodeRequest, db: Session = Depends(get_db)):
    try:
        redirect_uri = data.redirect_uri or get_configured_redirect_uri()
        logger.warning(
            "Google code login requested: code_present=%s, code_length=%s, redirect_uri=%s",
            bool(data.code),
            len(data.code) if data.code else 0,
            redirect_uri,
        )
        creds = exchange_code(data.code, redirect_uri=redirect_uri)
        profile = get_google_profile(creds)
        user = upsert_google_user(db, profile, creds)
        db.commit()
        db.refresh(user)
        return _token_response(user, db)
    except ValueError as exc:
        db.rollback()
        logger.warning("Google code login value error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except GoogleOAuthError as exc:
        db.rollback()
        logger.warning(
            "Google code login failed at %s: reason=%s, detail=%s",
            exc.stage,
            exc.reason,
            exc.detail,
        )
        if exc.reason in ("invalid_client", "unauthorized_client"):
            logger.warning(
                "Google OAuth client mismatch hint: verify GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET belong to the same OAuth Client in Google Cloud Console."
            )
        raise HTTPException(status_code=400, detail=f"Google OAuth failed: {exc.reason}")
    except Exception as exc:
        db.rollback()
        logger.exception("Google login failed: %s", exc)
        raise HTTPException(status_code=500, detail="Google login failed.")


@router.post("/google/ticket", response_model=TokenResponse)
def google_ticket_login(data: GoogleTicketRequest):
    payload = consume_login_ticket(data.ticket)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google login ticket is invalid or expired.",
        )
    return TokenResponse(**payload)


@router.get("/me", response_model=MeResponse)
def get_me(
    current: dict = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == current["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User was not found.")

    account = db.query(GoogleAccount).filter(GoogleAccount.user_id == user.id).first()
    return MeResponse(
        user_id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        safety_certified=user.safety_certified or False,
        safety_certified_at=user.safety_certified_at,
        google_connected=bool(account and account.refresh_token_encrypted),
        picture_url=account.picture_url if account else None,
        created_at=user.created_at,
    )
