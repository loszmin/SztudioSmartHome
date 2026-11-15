from fastapi import APIRouter, Depends

from app.api import alarms, auth, cameras, devices, events, network, recorders, sensors, system
from app.auth import current_principal

#: Wszystkie zasoby poza logowaniem i kontrolą stanu wymagają uwierzytelnienia.
protected = APIRouter(dependencies=[Depends(current_principal)])
for module in (system, devices, cameras, recorders, alarms, sensors, events, network):
    protected.include_router(module.router)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(system.public_router)
api_router.include_router(protected)
