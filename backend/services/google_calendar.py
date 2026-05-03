"""
services/google_calendar.py — Google Calendar API 연동 서비스

[사전 준비]
1. Google Cloud Console → API & Services → Credentials
2. OAuth 2.0 Client ID 생성 (Web application)
3. Authorized redirect URI: http://localhost:8000/api/v1/gcal/callback
4. .env 파일에 GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET 설정
5. Google Calendar API 활성화 (APIs & Services → Library)

[흐름]
  사용자 → /gcal/auth → Google 로그인 → /gcal/callback → 토큰 저장
  예약 생성 → create_event() → Google Calendar에 이벤트 자동 추가
"""

import os
import json
import logging
from datetime import datetime
from typing import Optional
from pathlib import Path

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)

# ─── 설정 ───────────────────────────────────────────────────────────────────────
SCOPES = ["https://www.googleapis.com/auth/calendar"]

# 토큰 저장 경로 (개발 환경: 파일 기반, 프로덕션: DB 저장 권장)
TOKEN_PATH = Path(__file__).parent.parent / "gcal_token.json"

# 장비 ID → 이름 매핑 (이벤트 제목용)
EQUIPMENT_NAMES = {
    1: "XRD", 2: "SEM", 3: "E-beam", 4: "AFM",
    5: "Furnace #1", 6: "Furnace #2", 7: "Furnace #3", 8: "Furnace #4",
}

# 장비별 색상 (Google Calendar colorId: 1~11)
EQUIPMENT_COLORS = {
    1: "1",   # XRD — Lavender
    2: "2",   # SEM — Sage
    3: "6",   # E-beam — Tangerine
    4: "3",   # AFM — Grape
    5: "10",  # Furnace #1 — Basil
    6: "10",  # Furnace #2 — Basil
    7: "10",  # Furnace #3 — Basil
    8: "10",  # Furnace #4 — Basil
}


# ─── OAuth2 Flow 생성 ──────────────────────────────────────────────────────────
def _get_client_config() -> dict:
    """환경변수에서 Google OAuth2 클라이언트 설정을 구성"""
    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/v1/gcal/callback")

    if not client_id or not client_secret:
        raise ValueError(
            "GOOGLE_CLIENT_ID 및 GOOGLE_CLIENT_SECRET 환경변수가 필요합니다. "
            ".env 파일을 확인해주세요."
        )

    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }


def create_auth_flow(redirect_uri: Optional[str] = None) -> Flow:
    """Google OAuth2 인증 Flow 생성"""
    config = _get_client_config()
    uri = redirect_uri or config["web"]["redirect_uris"][0]

    flow = Flow.from_client_config(
        client_config=config,
        scopes=SCOPES,
        redirect_uri=uri,
    )
    return flow


def get_auth_url() -> str:
    """Google 로그인 URL 반환"""
    flow = create_auth_flow()
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",  # 항상 refresh_token을 받기 위해
    )
    return auth_url


def exchange_code(code: str) -> Credentials:
    """인증 코드를 토큰으로 교환하고 저장"""
    flow = create_auth_flow()
    flow.fetch_token(code=code)
    creds = flow.credentials
    _save_token(creds)
    return creds


# ─── 토큰 관리 ─────────────────────────────────────────────────────────────────
def _save_token(creds: Credentials):
    """토큰을 파일에 저장"""
    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes) if creds.scopes else SCOPES,
    }
    TOKEN_PATH.write_text(json.dumps(token_data, indent=2))
    logger.info("Google Calendar 토큰 저장 완료: %s", TOKEN_PATH)


def _load_credentials() -> Optional[Credentials]:
    """저장된 토큰에서 Credentials 로드 (자동 갱신 포함)"""
    if not TOKEN_PATH.exists():
        return None

    try:
        token_data = json.loads(TOKEN_PATH.read_text())
        creds = Credentials(
            token=token_data["token"],
            refresh_token=token_data.get("refresh_token"),
            token_uri=token_data.get("token_uri", "https://oauth2.googleapis.com/token"),
            client_id=token_data.get("client_id") or os.getenv("GOOGLE_CLIENT_ID"),
            client_secret=token_data.get("client_secret") or os.getenv("GOOGLE_CLIENT_SECRET"),
            scopes=token_data.get("scopes", SCOPES),
        )

        # 토큰이 만료되었으면 자동 갱신
        if creds.expired and creds.refresh_token:
            from google.auth.transport.requests import Request
            creds.refresh(Request())
            _save_token(creds)
            logger.info("Google Calendar 토큰 자동 갱신 완료")

        return creds

    except Exception as e:
        logger.error("토큰 로드 실패: %s", e)
        return None


def is_connected() -> bool:
    """Google Calendar 연동 상태 확인"""
    creds = _load_credentials()
    return creds is not None and creds.valid


def disconnect():
    """Google Calendar 연동 해제 (토큰 삭제)"""
    if TOKEN_PATH.exists():
        TOKEN_PATH.unlink()
        logger.info("Google Calendar 연동 해제")


def _get_service():
    """Google Calendar API 서비스 객체 반환"""
    creds = _load_credentials()
    if not creds:
        raise ConnectionError("Google Calendar이 연동되지 않았습니다. /gcal/auth로 인증해주세요.")
    return build("calendar", "v3", credentials=creds)


# ─── 캘린더 이벤트 CRUD ────────────────────────────────────────────────────────
def create_event(
    equipment_id: int,
    user_name: str,
    start_time: datetime,
    end_time: datetime,
    purpose: str = "",
    reservation_id: Optional[int] = None,
    calendar_id: str = "primary",
) -> Optional[str]:
    """
    Google Calendar에 예약 이벤트 생성
    Returns: Google Calendar event ID (성공 시) 또는 None
    """
    try:
        service = _get_service()
        equip_name = EQUIPMENT_NAMES.get(equipment_id, f"장비#{equipment_id}")

        event_body = {
            "summary": f"[LabFlow] {equip_name} 예약",
            "description": (
                f"장비: {equip_name}\n"
                f"사용자: {user_name}\n"
                f"목적: {purpose}\n"
                f"예약 ID: {reservation_id or 'N/A'}\n"
                f"\n— LabFlow 자동 동기화"
            ),
            "start": {
                "dateTime": start_time.isoformat(),
                "timeZone": "Asia/Seoul",
            },
            "end": {
                "dateTime": end_time.isoformat(),
                "timeZone": "Asia/Seoul",
            },
            "colorId": EQUIPMENT_COLORS.get(equipment_id, "1"),
            "reminders": {
                "useDefault": False,
                "overrides": [
                    {"method": "popup", "minutes": 30},
                    {"method": "popup", "minutes": 10},
                ],
            },
        }

        event = service.events().insert(
            calendarId=calendar_id,
            body=event_body,
        ).execute()

        event_id = event.get("id")
        logger.info("Google Calendar 이벤트 생성: %s (예약 #%s)", event_id, reservation_id)
        return event_id

    except ConnectionError:
        logger.warning("Google Calendar 미연동 — 이벤트 생성 건너뜀")
        return None
    except HttpError as e:
        logger.error("Google Calendar API 오류: %s", e)
        return None
    except Exception as e:
        logger.error("이벤트 생성 실패: %s", e)
        return None


def update_event(
    gcal_event_id: str,
    equipment_id: Optional[int] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    purpose: Optional[str] = None,
    status_text: Optional[str] = None,
    calendar_id: str = "primary",
) -> bool:
    """
    Google Calendar 이벤트 수정
    Returns: 성공 여부
    """
    try:
        service = _get_service()

        # 기존 이벤트 가져오기
        event = service.events().get(
            calendarId=calendar_id,
            eventId=gcal_event_id,
        ).execute()

        # 업데이트할 필드만 수정
        if equipment_id is not None:
            equip_name = EQUIPMENT_NAMES.get(equipment_id, f"장비#{equipment_id}")
            event["summary"] = f"[LabFlow] {equip_name} 예약"
            event["colorId"] = EQUIPMENT_COLORS.get(equipment_id, "1")

        if start_time:
            event["start"] = {"dateTime": start_time.isoformat(), "timeZone": "Asia/Seoul"}
        if end_time:
            event["end"] = {"dateTime": end_time.isoformat(), "timeZone": "Asia/Seoul"}

        if status_text:
            # 제목에 상태 추가
            summary = event.get("summary", "")
            # 기존 상태 태그 제거 후 새로 추가
            for tag in ["[사용중]", "[완료]", "[취소]", "[조기완료]"]:
                summary = summary.replace(tag, "").strip()
            event["summary"] = f"{summary} {status_text}"

        if purpose and "description" in event:
            desc = event["description"]
            # 목적 라인 업데이트
            lines = desc.split("\n")
            for i, line in enumerate(lines):
                if line.startswith("목적:"):
                    lines[i] = f"목적: {purpose}"
            event["description"] = "\n".join(lines)

        service.events().update(
            calendarId=calendar_id,
            eventId=gcal_event_id,
            body=event,
        ).execute()

        logger.info("Google Calendar 이벤트 수정: %s", gcal_event_id)
        return True

    except Exception as e:
        logger.error("이벤트 수정 실패: %s", e)
        return False


def delete_event(
    gcal_event_id: str,
    calendar_id: str = "primary",
) -> bool:
    """
    Google Calendar 이벤트 삭제
    Returns: 성공 여부
    """
    try:
        service = _get_service()
        service.events().delete(
            calendarId=calendar_id,
            eventId=gcal_event_id,
        ).execute()

        logger.info("Google Calendar 이벤트 삭제: %s", gcal_event_id)
        return True

    except Exception as e:
        logger.error("이벤트 삭제 실패: %s", e)
        return False


def sync_all_reservations(reservations: list, calendar_id: str = "primary") -> dict:
    """
    모든 예약을 Google Calendar에 일괄 동기화
    Returns: { "synced": int, "failed": int, "skipped": int }
    """
    result = {"synced": 0, "failed": 0, "skipped": 0}

    for r in reservations:
        # 이미 동기화된 예약은 건너뜀
        if getattr(r, "gcal_event_id", None):
            result["skipped"] += 1
            continue

        event_id = create_event(
            equipment_id=r.equipment_id,
            user_name=f"User #{r.user_id}",
            start_time=r.start_time,
            end_time=r.end_time,
            purpose=r.purpose or "",
            reservation_id=r.id,
            calendar_id=calendar_id,
        )

        if event_id:
            r.gcal_event_id = event_id
            result["synced"] += 1
        else:
            result["failed"] += 1

    return result
