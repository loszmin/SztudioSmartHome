"""Hasła, tokeny dostępu i szyfrowanie danych logowania urządzeń."""

import base64
import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

_hasher = PasswordHasher()
#: Skrót używany, gdy użytkownik nie istnieje – wyrównuje czas odpowiedzi logowania.
_DUMMY_HASH = _hasher.hash("sztudio-dummy-password")

API_TOKEN_PREFIX = "szt_"
JWT_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def _derive_key(secret: str, purpose: bytes) -> bytes:
    """Wyprowadza niezależny klucz 32-bajtowy dla danego zastosowania."""
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=purpose).derive(secret.encode())


class TokenSigner:
    """Wydaje i weryfikuje tokeny dostępu (JWT) po zalogowaniu."""

    def __init__(self, secret: str, ttl_minutes: int) -> None:
        self._key = _derive_key(secret, b"sztudio-core/access-token")
        self._ttl = timedelta(minutes=ttl_minutes)

    def issue(self, user_id: str, token_version: int, now: datetime | None = None) -> tuple[str, datetime]:
        issued = now or datetime.now(UTC)
        expires = issued + self._ttl
        token = jwt.encode(
            {"sub": user_id, "ver": token_version, "iat": issued, "exp": expires},
            self._key,
            algorithm=JWT_ALGORITHM,
        )
        return token, expires

    def verify(self, token: str) -> tuple[str, int] | None:
        """Zwraca (id użytkownika, wersja tokenu) albo None dla tokenu błędnego lub wygasłego."""
        try:
            payload = jwt.decode(
                token, self._key, algorithms=[JWT_ALGORITHM], options={"require": ["sub", "exp"]}
            )
        except jwt.PyJWTError:
            return None
        return str(payload["sub"]), int(payload.get("ver", 0))


class SecretBox:
    """Szyfrowanie symetryczne danych logowania urządzeń (hasła rejestratorów, adresy RTSP)."""

    def __init__(self, secret: str) -> None:
        key = _derive_key(secret, b"sztudio-core/device-credentials")
        self._fernet = Fernet(base64.urlsafe_b64encode(key))

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        try:
            return self._fernet.decrypt(ciphertext.encode()).decode()
        except InvalidToken as error:
            raise ValueError("Nie można odszyfrować danych – zmieniono SZTUDIO_SECRET_KEY?") from error


def generate_api_token() -> str:
    return API_TOKEN_PREFIX + secrets.token_urlsafe(32)


def hash_api_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
