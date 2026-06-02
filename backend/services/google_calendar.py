"""Google OAuth and Google Calendar helpers for LabFlow.

Secrets and refresh tokens are handled only on the backend. The browser only
receives the LabFlow JWT that is already used by the app.
"""

import base64
import hashlib
import logging
import os
import re
from datetime import datetime, timedelta
from typing import Optional

import httpx
from cryptography.fernet import Fernet, InvalidToken
from google.auth.transport.requests import Request
from google.oauth2 import id_token as google_id_token
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session

from models import CalendarSync, GoogleAccount, Reservation, User

logger = logging.getLogger(__name__)

SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar.events",
]

DEFAULT_REDIRECT_URI = "http://localhost:8000/api/v1/gcal/callback"
DEFAULT_TIME_ZONE = "Asia/Seoul"


class GoogleOAuthError(Exception):
    def __init__(self, stage: str, reason: str, detail: str = ""):
        self.stage = stage
        self.reason = reason
        self.detail = detail
        super().__init__(f"{stage}: {reason}")

EQUIPMENT_NAMES = {
    1: "XRD",
    2: "SEM",
    3: "E-beam",
    4: "AFM",
    5: "Furnace #1",
    6: "Furnace #2",
    7: "Furnace #3",
    8: "Furnace #4",
}

EQUIPMENT_COLORS = {
    1: "1",
    2: "2",
    3: "6",
    4: "3",
    5: "10",
    6: "10",
    7: "10",
    8: "10",
}


def _safe_message(value: object) -> str:
    message = str(value)
    patterns = [
        r"(access_token=)[^&\s]+",
        r"(refresh_token=)[^&\s]+",
        r"(id_token=)[^&\s]+",
        r"(code=)[^&\s]+",
        r"(client_secret=)[^&\s]+",
        r'("access_token"\s*:\s*")[^"]+',
        r'("refresh_token"\s*:\s*")[^"]+',
        r'("id_token"\s*:\s*")[^"]+',
        r'("client_secret"\s*:\s*")[^"]+',
    ]
    for pattern in patterns:
        message = re.sub(pattern, r"\1[REDACTED]", message, flags=re.IGNORECASE)
    return message


def _client_id_hint(client_id: str) -> str:
    if not client_id:
        return "missing"
    if len(client_id) <= 16:
        return "present"
    return f"...{client_id[-16:]}"


def get_configured_redirect_uri() -> str:
    return os.getenv("GOOGLE_REDIRECT_URI", DEFAULT_REDIRECT_URI)


def get_oauth_diagnostics() -> dict:
    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
    redirect_uri = get_configured_redirect_uri()
    return {
        "redirect_uri": redirect_uri,
        "redirect_matches_default": redirect_uri == DEFAULT_REDIRECT_URI,
        "client_id_present": bool(client_id),
        "client_id_hint": _client_id_hint(client_id),
        "client_secret_present": bool(client_secret),
    }


def _allow_local_http_oauth(redirect_uri: str) -> None:
    if redirect_uri.startswith(("http://localhost", "http://127.0.0.1")):
        os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")


def _oauth_error_reason(exc: Exception) -> tuple[str, str]:
    error = getattr(exc, "error", None) or exc.__class__.__name__
    description = (
        getattr(exc, "description", None)
        or getattr(exc, "message", None)
        or _safe_message(exc)
    )
    return str(error), _safe_message(description)


def _google_client_config() -> dict:
    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
    redirect_uri = get_configured_redirect_uri()

    if not client_id or not client_secret:
        raise ValueError("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.")

    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }


def _token_uri() -> str:
    return _google_client_config()["web"]["token_uri"]


def create_auth_flow(redirect_uri: Optional[str] = None) -> Flow:
    config = _google_client_config()
    resolved_redirect_uri = redirect_uri or config["web"]["redirect_uris"][0]
    _allow_local_http_oauth(resolved_redirect_uri)
    flow = Flow.from_client_config(
        client_config=config,
        scopes=SCOPES,
        redirect_uri=resolved_redirect_uri,
        autogenerate_code_verifier=False,
    )
    return flow


def get_auth_url(state: str, redirect_uri: Optional[str] = None) -> str:
    diagnostics = get_oauth_diagnostics()
    logger.warning(
        "Google OAuth auth URL config: redirect_uri=%s, client_id_present=%s, client_id_hint=%s, client_secret_present=%s, pkce_enabled=False",
        diagnostics["redirect_uri"],
        diagnostics["client_id_present"],
        diagnostics["client_id_hint"],
        diagnostics["client_secret_present"],
    )
    flow = create_auth_flow(redirect_uri=redirect_uri)
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )
    return auth_url


def exchange_code(code: str, redirect_uri: Optional[str] = None) -> Credentials:
    config = _google_client_config()["web"]
    resolved_redirect_uri = redirect_uri or config["redirect_uris"][0]
    _allow_local_http_oauth(resolved_redirect_uri)
    logger.warning(
        "Google OAuth token exchange start: redirect_uri=%s, code_present=%s, code_length=%s",
        resolved_redirect_uri,
        bool(code),
        len(code) if code else 0,
    )
    try:
        response = httpx.post(
            config["token_uri"],
            data={
                "code": code,
                "client_id": config["client_id"],
                "client_secret": config["client_secret"],
                "redirect_uri": resolved_redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=15,
        )

        token_data = response.json() if response.content else {}
        if response.status_code >= 400:
            reason = str(token_data.get("error") or f"http_{response.status_code}")
            detail = _safe_message(token_data.get("error_description") or response.text)
            logger.warning(
                "Google OAuth token exchange failed: redirect_uri=%s, google_error=%s, detail=%s",
                resolved_redirect_uri,
                reason,
                detail,
            )
            raise GoogleOAuthError("token_exchange", reason, detail)

        expiry = None
        if token_data.get("expires_in"):
            expiry = datetime.utcnow() + timedelta(seconds=int(token_data["expires_in"]))

        granted_scopes = token_data.get("scope", "")
        scopes = granted_scopes.split() if granted_scopes else SCOPES
        creds = Credentials(
            token=token_data.get("access_token"),
            refresh_token=token_data.get("refresh_token"),
            id_token=token_data.get("id_token"),
            token_uri=config["token_uri"],
            client_id=config["client_id"],
            client_secret=config["client_secret"],
            scopes=scopes,
            expiry=expiry,
        )
        logger.info("Google OAuth token exchange succeeded: redirect_uri=%s", resolved_redirect_uri)
        return creds
    except GoogleOAuthError:
        raise
    except Exception as exc:
        reason, detail = _oauth_error_reason(exc)
        logger.warning(
            "Google OAuth token exchange failed: redirect_uri=%s, google_error=%s, detail=%s",
            resolved_redirect_uri,
            reason,
            detail,
        )
        raise GoogleOAuthError("token_exchange", reason, detail) from exc


def _fernet() -> Fernet:
    raw_secret = (
        os.getenv("TOKEN_ENCRYPTION_KEY")
        or os.getenv("JWT_SECRET_KEY")
        or "labflow-dev-secret-change-in-production"
    )
    key_bytes = raw_secret.encode("utf-8")

    try:
        return Fernet(key_bytes)
    except (ValueError, TypeError):
        derived = base64.urlsafe_b64encode(hashlib.sha256(key_bytes).digest())
        return Fernet(derived)


def _encrypt(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return _fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def _decrypt(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ConnectionError("Stored Google credentials cannot be decrypted.") from exc


def get_google_profile(creds: Credentials) -> dict:
    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    try:
        if creds.id_token:
            profile = google_id_token.verify_oauth2_token(creds.id_token, Request(), client_id)
            logger.info(
                "Google OAuth profile verified from id_token: sub_present=%s, email_present=%s",
                bool(profile.get("sub")),
                bool(profile.get("email")),
            )
            return profile

        if not creds.token:
            raise ValueError("Google access token was not returned.")

        response = httpx.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {creds.token}"},
            timeout=10,
        )
        response.raise_for_status()
        profile = response.json()
        logger.info(
            "Google OAuth profile loaded from userinfo: sub_present=%s, email_present=%s",
            bool(profile.get("sub")),
            bool(profile.get("email")),
        )
        return profile
    except Exception as exc:
        reason, detail = _oauth_error_reason(exc)
        logger.warning("Google OAuth profile load failed: google_error=%s, detail=%s", reason, detail)
        raise GoogleOAuthError("profile", reason, detail) from exc


def upsert_google_user(
    db: Session,
    profile: dict,
    creds: Credentials,
    user: Optional[User] = None,
) -> User:
    google_sub = profile.get("sub")
    email = profile.get("email")
    name = profile.get("name") or email or "Google User"
    picture_url = profile.get("picture")

    if not google_sub or not email:
        raise ValueError("Google profile is missing required user fields.")

    account = db.query(GoogleAccount).filter(GoogleAccount.google_sub == google_sub).first()

    if user is None:
        if account:
            user = account.user
        else:
            user = db.query(User).filter(User.email == email).first()
            if user is None:
                user = User(name=name, email=email, hashed_password=None, role="researcher")
                db.add(user)
                db.flush()
    elif account and account.user_id != user.id:
        raise ValueError("This Google account is already linked to another LabFlow user.")

    if user.name != name and not user.hashed_password:
        user.name = name

    if account is None:
        account = db.query(GoogleAccount).filter(GoogleAccount.user_id == user.id).first()

    refresh_token = creds.refresh_token
    if account and not refresh_token:
        refresh_token = _decrypt(account.refresh_token_encrypted)

    if account is None:
        account = GoogleAccount(user_id=user.id, google_sub=google_sub)
        db.add(account)

    account.google_sub = google_sub
    account.email = email
    account.name = name
    account.picture_url = picture_url
    account.access_token_encrypted = _encrypt(creds.token)
    account.refresh_token_encrypted = _encrypt(refresh_token)
    account.token_expiry = creds.expiry
    account.scope = " ".join(creds.scopes or SCOPES)
    account.token_uri = creds.token_uri or _token_uri()
    account.updated_at = datetime.utcnow()

    db.flush()
    return user


def get_google_account(db: Session, user_id: int) -> Optional[GoogleAccount]:
    return db.query(GoogleAccount).filter(GoogleAccount.user_id == user_id).first()


def is_connected(db: Session, user_id: int) -> bool:
    account = get_google_account(db, user_id)
    return bool(account and account.refresh_token_encrypted)


def disconnect(db: Session, user_id: int) -> None:
    account = get_google_account(db, user_id)
    if account:
        db.delete(account)
        db.commit()


def _credentials_from_account(db: Session, account: GoogleAccount) -> Credentials:
    config = _google_client_config()["web"]
    refresh_token = _decrypt(account.refresh_token_encrypted)
    access_token = _decrypt(account.access_token_encrypted)

    if not refresh_token:
        raise ConnectionError("Google Calendar permission is not connected.")

    scopes = account.scope.split() if account.scope else SCOPES
    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri=account.token_uri or config["token_uri"],
        client_id=config["client_id"],
        client_secret=config["client_secret"],
        scopes=scopes,
    )
    creds.expiry = account.token_expiry

    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        account.access_token_encrypted = _encrypt(creds.token)
        if creds.refresh_token:
            account.refresh_token_encrypted = _encrypt(creds.refresh_token)
        account.token_expiry = creds.expiry
        account.updated_at = datetime.utcnow()
        db.commit()

    if not creds.valid:
        raise ConnectionError("Google Calendar permission is invalid or expired.")

    return creds


def _calendar_service(db: Session, user_id: int):
    account = get_google_account(db, user_id)
    if not account:
        raise ConnectionError("Google Calendar permission is not connected.")
    creds = _credentials_from_account(db, account)
    return build("calendar", "v3", credentials=creds)


def _iso(dt: datetime | str) -> str:
    if isinstance(dt, datetime):
        return dt.isoformat()
    return dt


def _event_body(
    title: str,
    description: Optional[str],
    start: datetime | str,
    end: datetime | str,
    location: Optional[str] = None,
    time_zone: str = DEFAULT_TIME_ZONE,
    color_id: Optional[str] = None,
) -> dict:
    body = {
        "summary": title,
        "description": description or "",
        "location": location or "",
        "start": {"dateTime": _iso(start), "timeZone": time_zone},
        "end": {"dateTime": _iso(end), "timeZone": time_zone},
    }
    if color_id:
        body["colorId"] = color_id
    return body


def create_event(
    db: Session,
    user_id: int,
    title: str,
    description: Optional[str],
    start: datetime | str,
    end: datetime | str,
    location: Optional[str],
    labflow_item_id: Optional[str] = None,
    time_zone: str = DEFAULT_TIME_ZONE,
    calendar_id: str = "primary",
    color_id: Optional[str] = None,
) -> dict:
    if labflow_item_id:
        existing = (
            db.query(CalendarSync)
            .filter(
                CalendarSync.user_id == user_id,
                CalendarSync.labflow_item_id == labflow_item_id,
            )
            .first()
        )
        if existing:
            return {
                "created": False,
                "google_event_id": existing.google_event_id,
                "html_link": existing.html_link,
            }

    service = _calendar_service(db, user_id)
    event = (
        service.events()
        .insert(
            calendarId=calendar_id,
            body=_event_body(
                title=title,
                description=description,
                start=start,
                end=end,
                location=location,
                time_zone=time_zone,
                color_id=color_id,
            ),
        )
        .execute()
    )

    event_id = event.get("id")
    html_link = event.get("htmlLink")

    if labflow_item_id and event_id:
        db.add(
            CalendarSync(
                user_id=user_id,
                labflow_item_id=labflow_item_id,
                google_event_id=event_id,
                html_link=html_link,
                synced_at=datetime.utcnow(),
            )
        )
        db.flush()

    return {"created": True, "google_event_id": event_id, "html_link": html_link}


def create_reservation_event(
    db: Session,
    reservation: Reservation,
    calendar_user_id: Optional[int] = None,
) -> Optional[dict]:
    target_user_id = calendar_user_id or reservation.user_id
    if not is_connected(db, target_user_id):
        return None

    if target_user_id == reservation.user_id and reservation.gcal_event_id:
        return {
            "created": False,
            "google_event_id": reservation.gcal_event_id,
            "html_link": None,
        }

    equipment = reservation.equipment
    user = reservation.user
    equip_name = equipment.name if equipment else EQUIPMENT_NAMES.get(reservation.equipment_id, f"Equipment #{reservation.equipment_id}")
    user_name = user.name if user else f"User #{reservation.user_id}"
    location = equipment.location if equipment and equipment.location else equip_name
    purpose = reservation.purpose or "Reservation"
    labflow_item_id = f"reservation:{reservation.id}"

    result = create_event(
        db=db,
        user_id=target_user_id,
        title=f"[LabFlow] {equip_name} reservation",
        description=(
            f"Equipment: {equip_name}\n"
            f"User: {user_name}\n"
            f"Purpose: {purpose}\n"
            f"Reservation ID: {reservation.id}"
        ),
        start=reservation.start_time,
        end=reservation.end_time,
        location=location,
        labflow_item_id=labflow_item_id,
        color_id=EQUIPMENT_COLORS.get(reservation.equipment_id),
    )
    if target_user_id == reservation.user_id and result.get("google_event_id"):
        reservation.gcal_event_id = result["google_event_id"]
        db.flush()
    return result


def update_event(
    db: Session,
    user_id: int,
    gcal_event_id: str,
    title: Optional[str] = None,
    description: Optional[str] = None,
    location: Optional[str] = None,
    start: Optional[datetime | str] = None,
    end: Optional[datetime | str] = None,
    status_text: Optional[str] = None,
    calendar_id: str = "primary",
) -> bool:
    service = _calendar_service(db, user_id)
    event = service.events().get(calendarId=calendar_id, eventId=gcal_event_id).execute()

    if title:
        event["summary"] = title
    if status_text:
        summary = event.get("summary", "")
        for tag in ["[In use]", "[Done]", "[Cancelled]", "[Early done]", "[Confirmed]"]:
            summary = summary.replace(tag, "").strip()
        event["summary"] = f"{summary} {status_text}".strip()
    if description is not None:
        event["description"] = description
    if location is not None:
        event["location"] = location
    if start is not None:
        event["start"] = {"dateTime": _iso(start), "timeZone": DEFAULT_TIME_ZONE}
    if end is not None:
        event["end"] = {"dateTime": _iso(end), "timeZone": DEFAULT_TIME_ZONE}

    service.events().update(calendarId=calendar_id, eventId=gcal_event_id, body=event).execute()
    return True


def delete_event(db: Session, user_id: int, gcal_event_id: str, calendar_id: str = "primary") -> bool:
    service = _calendar_service(db, user_id)
    try:
        service.events().delete(calendarId=calendar_id, eventId=gcal_event_id).execute()
    except HttpError as exc:
        if getattr(exc.resp, "status", None) not in (404, 410):
            raise

    sync = (
        db.query(CalendarSync)
        .filter(CalendarSync.user_id == user_id, CalendarSync.google_event_id == gcal_event_id)
        .first()
    )
    if sync:
        db.delete(sync)
        db.flush()
    return True


def sync_all_reservations(db: Session, user_id: int, reservations: list[Reservation]) -> dict:
    result = {"synced": 0, "failed": 0, "skipped": 0, "links": []}

    for reservation in reservations:
        labflow_item_id = f"reservation:{reservation.id}"
        existing = (
            db.query(CalendarSync)
            .filter(
                CalendarSync.user_id == user_id,
                CalendarSync.labflow_item_id == labflow_item_id,
            )
            .first()
        )
        if existing:
            result["skipped"] += 1
            continue

        try:
            event = create_reservation_event(db, reservation, calendar_user_id=user_id)
            if not event:
                result["failed"] += 1
            elif event.get("created"):
                result["synced"] += 1
                result["links"].append(event)
            else:
                result["skipped"] += 1
        except Exception as exc:
            logger.warning("Reservation %s Google sync failed: %s", reservation.id, exc)
            result["failed"] += 1

    return result


def freebusy(
    db: Session,
    user_id: int,
    start: datetime | str,
    end: datetime | str,
    time_zone: str = DEFAULT_TIME_ZONE,
    calendar_id: str = "primary",
) -> list[dict]:
    service = _calendar_service(db, user_id)
    body = {
        "timeMin": _iso(start),
        "timeMax": _iso(end),
        "timeZone": time_zone,
        "items": [{"id": calendar_id}],
    }
    response = service.freebusy().query(body=body).execute()
    return response.get("calendars", {}).get(calendar_id, {}).get("busy", [])
