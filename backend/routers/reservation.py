"""Reservation API routes."""

import logging
import os
import sys
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from models import Reservation, ReservationStatus
from routers.noshow import is_user_banned
from routers.safety import is_user_safety_certified
from services.google_calendar import (
    create_reservation_event,
    delete_event,
    is_connected as gcal_connected,
    update_event,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reservations", tags=["reservations"])


class ReservationCreate(BaseModel):
    equipment_id: int
    user_id: int
    start_time: datetime
    end_time: datetime
    purpose: Optional[str] = None


class ReservationUpdate(BaseModel):
    status: ReservationStatus


class ReservationResponse(BaseModel):
    id: int
    equipment_id: int
    user_id: int
    start_time: datetime
    end_time: datetime
    purpose: Optional[str]
    status: ReservationStatus
    checkin_time: Optional[datetime] = None
    checkout_time: Optional[datetime] = None
    early_checkout: bool = False
    gcal_event_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


def _sync_to_gcal_create(reservation: Reservation, db: Session) -> None:
    if not gcal_connected(db, reservation.user_id):
        return

    try:
        result = create_reservation_event(db, reservation)
        if result and result.get("google_event_id"):
            reservation.gcal_event_id = result["google_event_id"]
            db.commit()
            logger.info("Reservation #%d synced to Google Calendar.", reservation.id)
    except Exception as exc:
        logger.warning("Reservation #%d Google Calendar create sync failed: %s", reservation.id, exc)


def _sync_to_gcal_update(
    reservation: Reservation,
    db: Session,
    status_text: Optional[str] = None,
) -> None:
    if not reservation.gcal_event_id or not gcal_connected(db, reservation.user_id):
        return

    try:
        update_event(
            db=db,
            user_id=reservation.user_id,
            gcal_event_id=reservation.gcal_event_id,
            end=reservation.end_time,
            status_text=status_text,
        )
        db.commit()
        logger.info("Reservation #%d Google Calendar event updated.", reservation.id)
    except Exception as exc:
        logger.warning("Reservation #%d Google Calendar update sync failed: %s", reservation.id, exc)


def _sync_to_gcal_delete(reservation: Reservation, db: Session) -> None:
    if not reservation.gcal_event_id or not gcal_connected(db, reservation.user_id):
        return

    try:
        delete_event(
            db=db,
            user_id=reservation.user_id,
            gcal_event_id=reservation.gcal_event_id,
        )
        db.commit()
        logger.info("Reservation #%d Google Calendar event deleted.", reservation.id)
    except Exception as exc:
        logger.warning("Reservation #%d Google Calendar delete sync failed: %s", reservation.id, exc)


@router.get("/", response_model=List[ReservationResponse])
def get_all_reservations(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    return db.query(Reservation).offset(skip).limit(limit).all()


@router.get("/{reservation_id}", response_model=ReservationResponse)
def get_reservation(reservation_id: int, db: Session = Depends(get_db)):
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation was not found.")
    return reservation


@router.post("/", response_model=ReservationResponse, status_code=status.HTTP_201_CREATED)
def create_reservation(data: ReservationCreate, db: Session = Depends(get_db)):
    if data.end_time <= data.start_time:
        raise HTTPException(status_code=400, detail="End time must be after start time.")

    if not is_user_safety_certified(data.user_id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Safety certification is required before reserving equipment.",
        )

    ban = is_user_banned(data.user_id, data.equipment_id, db)
    if ban:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This user is banned from the equipment until "
                f"{ban.banned_until.strftime('%Y-%m-%d %H:%M')} UTC."
            ),
        )

    conflict = db.query(Reservation).filter(
        Reservation.equipment_id == data.equipment_id,
        Reservation.status != ReservationStatus.cancelled,
        Reservation.start_time < data.end_time,
        Reservation.end_time > data.start_time,
    ).first()

    if conflict:
        raise HTTPException(status_code=409, detail="This time slot is already reserved.")

    reservation = Reservation(**data.dict())
    db.add(reservation)
    db.commit()
    db.refresh(reservation)

    _sync_to_gcal_create(reservation, db)
    return reservation


@router.patch("/{reservation_id}", response_model=ReservationResponse)
def update_reservation_status(
    reservation_id: int,
    data: ReservationUpdate,
    db: Session = Depends(get_db),
):
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation was not found.")

    reservation.status = data.status
    db.commit()
    db.refresh(reservation)

    status_map = {
        ReservationStatus.confirmed: "[Confirmed]",
        ReservationStatus.cancelled: "[Cancelled]",
        ReservationStatus.completed: "[Done]",
    }
    _sync_to_gcal_update(reservation, db, status_map.get(data.status))

    if data.status == ReservationStatus.cancelled:
        _sync_to_gcal_delete(reservation, db)

    return reservation


@router.delete("/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reservation(reservation_id: int, db: Session = Depends(get_db)):
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation was not found.")

    _sync_to_gcal_delete(reservation, db)
    db.delete(reservation)
    db.commit()


@router.post("/{reservation_id}/checkin", response_model=ReservationResponse)
def checkin(reservation_id: int, db: Session = Depends(get_db)):
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation was not found.")
    if reservation.checkin_time:
        raise HTTPException(status_code=400, detail="Reservation is already checked in.")

    reservation.checkin_time = datetime.utcnow()
    reservation.status = ReservationStatus.confirmed
    db.commit()
    db.refresh(reservation)

    _sync_to_gcal_update(reservation, db, "[In use]")
    return reservation


@router.post("/{reservation_id}/checkout", response_model=ReservationResponse)
def checkout(reservation_id: int, db: Session = Depends(get_db)):
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation was not found.")
    if not reservation.checkin_time:
        raise HTTPException(status_code=400, detail="Check-in is required first.")
    if reservation.checkout_time:
        raise HTTPException(status_code=400, detail="Reservation is already checked out.")

    now = datetime.utcnow()
    reservation.checkout_time = now
    reservation.status = ReservationStatus.completed

    if now < reservation.end_time and (reservation.end_time - now).total_seconds() > 300:
        reservation.early_checkout = True
        reservation.end_time = now

    db.commit()
    db.refresh(reservation)

    _sync_to_gcal_update(
        reservation,
        db,
        "[Early done]" if reservation.early_checkout else "[Done]",
    )
    return reservation
