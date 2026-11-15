from fastapi import APIRouter, Response, status
from sqlalchemy import select

from app import models, schemas
from app.api.common import Hub, get_or_404
from app.auth import AdminPrincipal, DbSession
from app.realtime import commit_and_publish, emit
from app.services.sensors import apply_reading

router = APIRouter(prefix="/sensors", tags=["Czujniki"])


def _notify(session: DbSession, type_: str, sensor: models.Sensor) -> None:
    emit(session, "alarms", type_, schemas.dump(schemas.SensorOut.model_validate(sensor)))


@router.get("", response_model=list[schemas.SensorOut])
def list_sensors(session: DbSession) -> list[models.Sensor]:
    return list(session.scalars(select(models.Sensor).order_by(models.Sensor.type, models.Sensor.name)))


@router.post("", response_model=schemas.SensorOut, status_code=status.HTTP_201_CREATED)
def create_sensor(
    body: schemas.SensorCreate, _: AdminPrincipal, session: DbSession, hub: Hub
) -> models.Sensor:
    sensor = models.Sensor(id=models.new_id(), state="idle", connection="offline", **body.model_dump())
    session.add(sensor)
    _notify(session, "sensor.created", sensor)
    commit_and_publish(session, hub)
    return sensor


@router.patch("/{sensor_id}", response_model=schemas.SensorOut)
def update_sensor(
    sensor_id: str, body: schemas.SensorUpdate, _: AdminPrincipal, session: DbSession, hub: Hub
) -> models.Sensor:
    sensor = get_or_404(session, models.Sensor, sensor_id, "czujnik")
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None or field == "unit":
            setattr(sensor, field, value)
    _notify(session, "sensor.updated", sensor)
    commit_and_publish(session, hub)
    return sensor


@router.post(
    "/{sensor_id}/reading",
    response_model=schemas.SensorOut,
    summary="Zgłoszenie odczytu czujnika (punkt wejścia dla integracji)",
)
def report_reading(
    sensor_id: str, body: schemas.SensorReading, _: AdminPrincipal, session: DbSession, hub: Hub
) -> models.Sensor:
    sensor = get_or_404(session, models.Sensor, sensor_id, "czujnik")
    apply_reading(session, sensor, body)
    commit_and_publish(session, hub)
    return sensor


@router.delete("/{sensor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sensor(sensor_id: str, _: AdminPrincipal, session: DbSession, hub: Hub) -> Response:
    sensor = get_or_404(session, models.Sensor, sensor_id, "czujnik")
    _notify(session, "sensor.deleted", sensor)
    session.delete(sensor)
    commit_and_publish(session, hub)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
