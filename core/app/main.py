import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from app import __version__, models, ws
from app.api import api_router
from app.auth import LoginThrottle
from app.config import Settings, get_settings
from app.db import make_engine, make_session_factory
from app.integrations.go2rtc import Go2rtcClient
from app.integrations.netguard import AddressPolicy
from app.integrations.onvif.discovery import WS_DISCOVERY_PORT
from app.logging_filters import install_log_redaction
from app.monitor import DeviceMonitor
from app.realtime import RealtimeHub
from app.security import SecretBox, TokenSigner, hash_password
from app.services.alarms import get_alarm_system

logger = logging.getLogger("sztudio.core")


def bootstrap(app: FastAPI, settings: Settings) -> None:
    """Przygotowuje dane wymagane do pracy: stan uzbrojenia i – przy pustej bazie – konto administratora."""
    with app.state.session_factory() as session:
        get_alarm_system(session)
        has_users = session.scalar(select(func.count()).select_from(models.User)) > 0
        if not has_users:
            if settings.admin_username and settings.admin_password:
                session.add(
                    models.User(
                        id=models.new_id(),
                        username=settings.admin_username,
                        password_hash=hash_password(settings.admin_password.get_secret_value()),
                        role="admin",
                    )
                )
                logger.info("Utworzono konto administratora „%s”.", settings.admin_username)
            else:
                logger.warning(
                    "Brak użytkowników. Ustaw SZTUDIO_ADMIN_USERNAME i SZTUDIO_ADMIN_PASSWORD "
                    "albo uruchom: python -m app.cli create-admin"
                )
        session.commit()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        bootstrap(app, settings)
        app.state.monitor.start()
        yield
        await app.state.monitor.stop()
        app.state.engine.dispose()

    app = FastAPI(
        title="Sztudio Core API",
        version=__version__,
        description="Backend systemu Sztudio Smart Home.",
        lifespan=lifespan,
        # Dokumentacja interaktywna tylko poza produkcją.
        docs_url=None if settings.environment == "production" else "/api/docs",
        redoc_url=None,
        openapi_url=None if settings.environment == "production" else "/api/openapi.json",
    )

    secret = settings.secret_key.get_secret_value()
    app.state.settings = settings
    app.state.engine = make_engine(settings.database_url)
    app.state.session_factory = make_session_factory(app.state.engine)
    app.state.signer = TokenSigner(secret, settings.access_token_ttl_minutes)
    app.state.secret_box = SecretBox(secret)
    app.state.hub = RealtimeHub()
    app.state.login_throttle = LoginThrottle(settings.login_max_attempts, settings.login_lockout_seconds)
    app.state.started_monotonic = time.monotonic()
    app.state.ws_discovery_port = WS_DISCOVERY_PORT

    go2rtc = None
    if settings.go2rtc_url:
        go2rtc = Go2rtcClient(
            settings.go2rtc_url,
            settings.go2rtc_username,
            settings.go2rtc_password.get_secret_value() if settings.go2rtc_password else None,
        )
    app.state.monitor = DeviceMonitor(
        settings=settings,
        session_factory=app.state.session_factory,
        hub=app.state.hub,
        box=app.state.secret_box,
        policy=AddressPolicy.from_strings(settings.allowed_device_networks, settings.denied_device_networks),
        go2rtc=go2rtc,
    )

    if settings.cors_origin_list:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origin_list,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type"],
        )

    app.include_router(api_router)
    app.include_router(ws.router)
    return app


def app_factory() -> FastAPI:
    """Punkt wejścia dla uvicorn: `uvicorn app.main:app_factory --factory`."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    install_log_redaction()
    return create_app()
