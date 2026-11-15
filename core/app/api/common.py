from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db import Base
from app.realtime import RealtimeHub
from app.security import SecretBox


def get_hub(request: Request) -> RealtimeHub:
    return request.app.state.hub


def get_secret_box(request: Request) -> SecretBox:
    return request.app.state.secret_box


Hub = Annotated[RealtimeHub, Depends(get_hub)]
Secrets = Annotated[SecretBox, Depends(get_secret_box)]


def get_or_404[T: Base](session: Session, model: type[T], item_id: str, label: str) -> T:
    item = session.get(model, item_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Nie znaleziono: {label}.")
    return item
