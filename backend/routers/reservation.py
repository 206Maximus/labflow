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
from models import Equipment, Reservation, ReservationStatus
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
    equipment_id: Optional[int] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    purpose: Optional[str] = None
    status: Optional[ReservationStatus] = None


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
        event_fields = _reservation_event_fields(reservation, db)
        update_event(
            db=db,
            user_id=reservation.user_id,
            gcal_event_id=reservation.gcal_event_id,
            title=event_fields["title"],
            description=event_fields["description"],
            location=event_fields["location"],
            start=reservation.start_time,
            end=reservation.end_time,
            status_text=status_text,
        )
        db.commit()
        logger.info("Reservation #%d Google Calendar event updated.", reservation.id)
    except Exception as exc:
        logger.warning("Reservation #%d Google Calendar update sync failed: %s", reservation.id, exc)


def _reservation_event_fields(reservation: Reservation, db: Optional[Session] = None) -> dict:
    equipment = reservation.equipment
    if db and (not equipment or equipment.id != reservation.equipment_id):
        equipment = db.query(Equipment).filter(Equipment.id == reservation.equipment_id).first()

    user = reservation.user
    equip_name = equipment.name if equipment else f"Equipment #{reservation.equipment_id}"
    user_name = user.name if user else f"User #{reservation.user_id}"
    location = equipment.location if equipment and equipment.location else equip_name
    purpose = reservation.purpose or "Reservation"

    return {
        "title": f"[LabFlow] {equip_name} reservation",
        "description": (
            f"Equipment: {equip_name}\n"
            f"User: {user_name}\n"
            f"Purpose: {purpose}\n"
            f"Reservation ID: {reservation.id}"
        ),
        "location": location,
    }


def _reservation_status_text(status_value: Optional[ReservationStatus]) -> Optional[str]:
    status_map = {
        ReservationStatus.confirmed: "[Confirmed]",
        ReservationStatus.cancelled: "[Cancelled]",
        ReservationStatus.completed: "[Done]",
    }
    return status_map.get(status_value)


def _sync_to_gcal_delete(reservation: Reservation, db: Session) -> bool:
    if not reservation.gcal_event_id or not gcal_connected(db, reservation.user_id):
        return False

    try:
        deleted = delete_event(
            db=db,
            user_id=reservation.user_id,
            gcal_event_id=reservation.gcal_event_id,
        )
        if deleted:
            reservation.gcal_event_id = None
        db.commit()
        logger.info("Reservation #%d Google Calendar event deleted.", reservation.id)
        return True
    except Exception as exc:
        logger.warning("Reservation #%d Google Calendar delete sync failed: %s", reservation.id, exc)
        return False


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
def update_reservation(
    reservation_id: int,
    data: ReservationUpdate,
    db: Session = Depends(get_db),
):
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation was not found.")

    update_fields = data.model_dump(exclude_unset=True)
    if not update_fields:
        raise HTTPException(status_code=400, detail="No reservation fields were provided.")

    if "equipment_id" in update_fields and data.equipment_id is None:
        raise HTTPException(status_code=400, detail="equipment_id cannot be null.")
    if "start_time" in update_fields and data.start_time is None:
        raise HTTPException(status_code=400, detail="start_time cannot be null.")
    if "end_time" in update_fields and data.end_time is None:
        raise HTTPException(status_code=400, detail="end_time cannot be null.")
    if "status" in update_fields and data.status is None:
        raise HTTPException(status_code=400, detail="status cannot be null.")

    new_equipment_id = data.equipment_id if "equipment_id" in update_fields else reservation.equipment_id
    new_start = data.start_time if "start_time" in update_fields else reservation.start_time
    new_end = data.end_time if "end_time" in update_fields else reservation.end_time
    new_status = data.status if "status" in update_fields else reservation.status

    if new_end <= new_start:
        raise HTTPException(status_code=400, detail="End time must be after start time.")

    if "equipment_id" in update_fields:
        equipment = db.query(Equipment).filter(Equipment.id == new_equipment_id).first()
        if not equipment:
            raise HTTPException(status_code=404, detail="Equipment was not found.")

        ban = is_user_banned(reservation.user_id, new_equipment_id, db)
        if ban:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "This user is banned from the equipment until "
                    f"{ban.banned_until.strftime('%Y-%m-%d %H:%M')} UTC."
                ),
            )

    schedule_changed = any(field in update_fields for field in ("equipment_id", "start_time", "end_time"))
    if schedule_changed and new_status != ReservationStatus.cancelled:
        conflict = db.query(Reservation).filter(
            Reservation.id != reservation.id,
            Reservation.equipment_id == new_equipment_id,
            Reservation.status != ReservationStatus.cancelled,
            Reservation.start_time < new_end,
            Reservation.end_time > new_start,
        ).first()

        if conflict:
            raise HTTPException(status_code=409, detail="This time slot is already reserved.")

    if "equipment_id" in update_fields:
        reservation.equipment_id = new_equipment_id
    if "start_time" in update_fields:
        reservation.start_time = new_start
    if "end_time" in update_fields:
        reservation.end_time = new_end
    if "purpose" in update_fields:
        reservation.purpose = data.purpose
    if "status" in update_fields:
        reservation.status = new_status

    db.commit()
    db.refresh(reservation)

    if new_status == ReservationStatus.cancelled:
        _sync_to_gcal_update(reservation, db, _reservation_status_text(new_status))
        _sync_to_gcal_delete(reservation, db)
    else:
        _sync_to_gcal_update(reservation, db, _reservation_status_text(new_status))

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
