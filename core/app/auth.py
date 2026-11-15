"""Uwierzytelnianie żądań HTTP i połączeń WebSocket."""

import threading
import time
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.db import get_session
from app.security import API_TOKEN_PREFIX, TokenSigner, hash_api_token


@dataclass(frozen=True)
class Principal:
    """Uwierzytelniony podmiot: użytkownik (po zalogowaniu) albo token API."""

    user_id: str
    username: str
    role: str
    via_api_token: bool = False

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


def authenticate_token(session: Session, signer: TokenSigner, token: str) -> Principal | None:
    """Rozpoznaje token dostępu (JWT) lub token API. Zwraca None, gdy token jest nieważny."""
    if token.startswith(API_TOKEN_PREFIX):
        api_token = session.scalars(
            select(models.ApiToken).where(
                models.ApiToken.token_hash == hash_api_token(token), models.ApiToken.revoked_at.is_(None)
            )
        ).first()
        if api_token is None or not api_token.user.is_active:
            return None
        now = models.utcnow()
        # Zapis „ostatnio użyty” najwyżej raz na minutę – bez obciążania bazy przy każdym żądaniu.
        if api_token.last_used_at is None or (now - api_token.last_used_at).total_seconds() > 60:
            api_token.last_used_at = now
            session.commit()
        return Principal(api_token.user_id, f"token:{api_token.name}", api_token.role, via_api_token=True)

    claims = signer.verify(token)
    if claims is None:
        return None
    user_id, version = claims
    user = session.get(models.User, user_id)
    if user is None or not user.is_active or user.token_version != version:
        return None
    return Principal(user.id, user.username, user.role)


_bearer = HTTPBearer(auto_error=False)


def current_principal(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    session: Annotated[Session, Depends(get_session)],
) -> Principal:
    principal = None
    if credentials is not None:
        principal = authenticate_token(session, request.app.state.signer, credentials.credentials)
    if principal is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Wymagane uwierzytelnienie.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return principal


def require_admin(principal: Annotated[Principal, Depends(current_principal)]) -> Principal:
    if not principal.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Operacja wymaga uprawnień administratora.")
    return principal


CurrentPrincipal = Annotated[Principal, Depends(current_principal)]
AdminPrincipal = Annotated[Principal, Depends(require_admin)]
DbSession = Annotated[Session, Depends(get_session)]


class LoginThrottle:
    """Ogranicza próby logowania: po N błędach dany login + adres są blokowane na określony czas."""

    def __init__(self, max_attempts: int, lockout_seconds: int) -> None:
        self._max = max_attempts
        self._window = lockout_seconds
        self._failures: dict[tuple[str, str], list[float]] = {}
        self._lock = threading.Lock()

    def retry_after(self, username: str, client: str) -> int:
        """Liczba sekund do odblokowania (0 = logowanie dozwolone)."""
        key = (username.lower(), client)
        now = time.monotonic()
        with self._lock:
            recent = [moment for moment in self._failures.get(key, []) if now - moment < self._window]
            if recent:
                self._failures[key] = recent
            else:
                self._failures.pop(key, None)
            if len(recent) >= self._max:
                return max(1, int(self._window - (now - recent[0])))
        return 0

    def record_failure(self, username: str, client: str) -> None:
        with self._lock:
            self._failures.setdefault((username.lower(), client), []).append(time.monotonic())

    def reset(self, username: str, client: str) -> None:
        with self._lock:
            self._failures.pop((username.lower(), client), None)
