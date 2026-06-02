"""Google Calendar routes.

The same Google callback handles two separate flows:
- Google login
- Calendar connection for an already logged-in LabFlow user
"""

import logging
import os
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth_utils import (
    create_access_token,
    create_login_payload,
    decode_access_token,
    get_required_user,
)
from database import get_db
from models import GoogleAccount, Reservation, ReservationStatus, User
from services.google_calendar import (
    GoogleOAuthError,
    create_event,
    disconnect,
    exchange_code,
    freebusy,
    get_configured_redirect_uri,
    get_auth_url,
    get_google_account,
    get_google_profile,
    get_oauth_diagnostics,
    is_connected,
    sync_all_reservations,
    upsert_google_user,
)
from services.login_tickets import issue_login_ticket

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/gcal", tags=["google-calendar"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


def _is_dev() -> bool:
    return os.getenv("ENV", os.getenv("APP_ENV", "development")).lower() != "production"


class GCalStatusResponse(BaseModel):
    connected: bool
    message: str
    google_email: Optional[str] = None


class GCalAuthResponse(BaseModel):
    auth_url: str


class GCalEventLink(BaseModel):
    created: bool
    google_event_id: Optional[str] = None
    html_link: Optional[str] = None


class GCalSyncResponse(BaseModel):
    success: bool
    synced: int
    failed: int
    skipped: int
    links: list[GCalEventLink] = []
    message: str


class CalendarEventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start: datetime
    end: datetime
    location: Optional[str] = None
    timeZone: str = "Asia/Seoul"
    labflowItemId: Optional[str] = None


class CalendarEventResponse(BaseModel):
    created: bool
    google_event_id: Optional[str] = None
    html_link: Optional[str] = None
    message: str


class FreeBusyRequest(BaseModel):
    start: datetime
    end: datetime
    timeZone: str = "Asia/Seoul"


class FreeBusyResponse(BaseModel):
    busy: list[dict]


def _redirect_with(params: dict) -> RedirectResponse:
    return RedirectResponse(url=f"{FRONTEND_URL}/?{urlencode(params)}")


def _calendar_state(user_id: int) -> str:
    return create_access_token(
        {"purpose": "gcal_connect", "sub": user_id},
        expires_delta=timedelta(minutes=10),
    )


def _login_success_redirect(payload: dict) -> RedirectResponse:
    ticket = issue_login_ticket(payload)
    return _redirect_with({"google_login_ticket": ticket})


def _login_payload(user: User, db: Session) -> dict:
    account = db.query(GoogleAccount).filter(GoogleAccount.user_id == user.id).first()
    return create_login_payload(
        user,
        google_connected=bool(account and account.refresh_token_encrypted),
        picture_url=account.picture_url if account else None,
    )


@router.get("/status", response_model=GCalStatusResponse)
def gcal_status(
    current: dict = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    account = get_google_account(db, current["user_id"])
    connected = bool(account and account.refresh_token_encrypted)
    return GCalStatusResponse(
        connected=connected,
        google_email=account.email if account else None,
        message="Google Calendar is connected." if connected else "Google Calendar is not connected.",
    )


@router.get("/auth", response_model=GCalAuthResponse)
def gcal_auth(current: dict = Depends(get_required_user)):
    try:
        return GCalAuthResponse(
            auth_url=get_auth_url(
                state=_calendar_state(current["user_id"]),
                redirect_uri=get_configured_redirect_uri(),
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/callback")
def gcal_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    diagnostics = get_oauth_diagnostics()
    logger.warning(
        "Google OAuth callback received: code_present=%s, code_length=%s, state_present=%s, redirect_uri=%s, redirect_matches_default=%s, client_id_present=%s, client_id_hint=%s, client_secret_present=%s",
        bool(code),
        len(code) if code else 0,
        bool(state),
        diagnostics["redirect_uri"],
        diagnostics["redirect_matches_default"],
        diagnostics["client_id_present"],
        diagnostics["client_id_hint"],
        diagnostics["client_secret_present"],
    )

    if error:
        logger.warning("Google OAuth callback returned provider error: %s", error)
        return _redirect_with({"gcal_error": error})
    if not code or not state:
        logger.warning(
            "Google OAuth callback missing parameter: code_present=%s, state_present=%s",
            bool(code),
            bool(state),
        )
        return _redirect_with({"gcal_error": "missing_oauth_code_or_state"})

    state_payload = decode_access_token(state)
    if not state_payload:
        logger.warning("Google OAuth callback state decode failed.")
        return _redirect_with({"gcal_error": "invalid_oauth_state"})

    purpose = state_payload.get("purpose")
    logger.warning("Google OAuth callback state purpose=%s", purpose)

    try:
        creds = exchange_code(code, redirect_uri=get_configured_redirect_uri())
        profile = get_google_profile(creds)

        if purpose == "google_login":
            user = upsert_google_user(db, profile, creds)
            db.commit()
            db.refresh(user)
            return _login_success_redirect(_login_payload(user, db))

        if purpose == "gcal_connect":
            user_id = int(state_payload.get("sub"))
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                return _redirect_with({"gcal_error": "user_not_found"})

            upsert_google_user(db, profile, creds, user=user)
            db.commit()
            return _redirect_with({"gcal_connected": "true"})

        return _redirect_with({"gcal_error": "unknown_oauth_purpose"})

    except ValueError as exc:
        db.rollback()
        logger.warning("Google OAuth callback value error: %s", exc)
        return _redirect_with({"gcal_error": str(exc)})
    except GoogleOAuthError as exc:
        db.rollback()
        logger.warning(
            "Google OAuth callback failed at %s: reason=%s, detail=%s",
            exc.stage,
            exc.reason,
            exc.detail,
        )
        if exc.reason in ("invalid_client", "unauthorized_client"):
            logger.warning(
                "Google OAuth client mismatch hint: verify GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET belong to the same OAuth Client in Google Cloud Console."
            )
        return _redirect_with({
            "gcal_error": exc.reason if _is_dev() else "google_oauth_failed",
            "stage": exc.stage if _is_dev() else "oauth",
        })
    except Exception as exc:
        db.rollback()
        logger.exception("Google OAuth callback unexpected failure: %s", exc)
        return _redirect_with({
            "gcal_error": exc.__class__.__name__ if _is_dev() else "google_oauth_failed",
            "stage": "unexpected" if _is_dev() else "oauth",
        })


@router.post("/sync", response_model=GCalSyncResponse)
def gcal_sync(
    current: dict = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    user_id = current["user_id"]
    if not is_connected(db, user_id):
        raise HTTPException(status_code=403, detail="Google Calendar permission is required.")

    reservations = (
        db.query(Reservation)
        .filter(
            Reservation.status.in_([ReservationStatus.pending, ReservationStatus.confirmed]),
            Reservation.end_time > Reservation.start_time,
        )
        .all()
    )
    owned_count = sum(1 for reservation in reservations if reservation.user_id == user_id)
    logger.warning(
        "Google Calendar sync selected %s schedulable reservations for calendar_user_id=%s, owned_by_user=%s",
        len(reservations),
        user_id,
        owned_count,
    )

    result = sync_all_reservations(db, user_id, reservations)
    db.commit()

    message = (
        "No schedulable reservations found."
        if not reservations
        else (
            f"Sync complete: {result['synced']} created, "
            f"{result['skipped']} skipped, {result['failed']} failed."
        )
    )

    return GCalSyncResponse(
        success=True,
        synced=result["synced"],
        failed=result["failed"],
        skipped=result["skipped"],
        links=[GCalEventLink(**link) for link in result.get("links", [])],
        message=message,
    )


@router.post("/events", response_model=CalendarEventResponse)
def create_calendar_event(
    data: CalendarEventCreate,
    current: dict = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    if data.end <= data.start:
        raise HTTPException(status_code=400, detail="End time must be after start time.")
    if not is_connected(db, current["user_id"]):
        raise HTTPException(status_code=403, detail="Google Calendar permission is required.")

    try:
        result = create_event(
            db=db,
            user_id=current["user_id"],
            title=data.title,
            description=data.description,
            start=data.start,
            end=data.end,
            location=data.location,
            time_zone=data.timeZone,
            labflow_item_id=data.labflowItemId,
        )
        db.commit()
        return CalendarEventResponse(
            created=result["created"],
            google_event_id=result.get("google_event_id"),
            html_link=result.get("html_link"),
            message=(
                "Google Calendar event created."
                if result["created"]
                else "This LabFlow item is already linked to Google Calendar."
            ),
        )
    except ConnectionError as exc:
        db.rollback()
        raise HTTPException(status_code=403, detail=str(exc))
    except Exception as exc:
        db.rollback()
        logger.warning("Google Calendar event creation failed: %s", exc)
        raise HTTPException(status_code=500, detail="Google Calendar event creation failed.")


@router.post("/freebusy", response_model=FreeBusyResponse)
def get_freebusy(
    data: FreeBusyRequest,
    current: dict = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    if data.end <= data.start:
        raise HTTPException(status_code=400, detail="End time must be after start time.")
    if not is_connected(db, current["user_id"]):
        raise HTTPException(status_code=403, detail="Google Calendar permission is required.")

    try:
        return FreeBusyResponse(
            busy=freebusy(
                db=db,
                user_id=current["user_id"],
                start=data.start,
                end=data.end,
                time_zone=data.timeZone,
            )
        )
    except ConnectionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except Exception as exc:
        logger.warning("Google Calendar freebusy failed: %s", exc)
        raise HTTPException(status_code=500, detail="Google Calendar freebusy lookup failed.")


@router.post("/disconnect", response_model=GCalStatusResponse)
def gcal_disconnect(
    current: dict = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    disconnect(db, current["user_id"])
    return GCalStatusResponse(
        connected=False,
        message="Google Calendar connection was removed.",
    )
