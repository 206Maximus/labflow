"""Short-lived one-time login tickets for frontend handoff."""

from datetime import datetime, timedelta
from secrets import token_urlsafe
from typing import Optional

_TICKETS: dict[str, tuple[dict, datetime]] = {}


def issue_login_ticket(payload: dict, ttl_seconds: int = 120) -> str:
    _cleanup_expired()
    ticket = token_urlsafe(32)
    _TICKETS[ticket] = (payload, datetime.utcnow() + timedelta(seconds=ttl_seconds))
    return ticket


def consume_login_ticket(ticket: str) -> Optional[dict]:
    _cleanup_expired()
    record = _TICKETS.pop(ticket, None)
    if not record:
        return None

    payload, expires_at = record
    if expires_at < datetime.utcnow():
        return None
    return payload


def _cleanup_expired() -> None:
    now = datetime.utcnow()
    expired = [ticket for ticket, (_, expires_at) in _TICKETS.items() if expires_at < now]
    for ticket in expired:
        _TICKETS.pop(ticket, None)
