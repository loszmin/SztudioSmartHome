"""RTSP: walidacja adresów oraz sprawdzanie dostępności strumienia (OPTIONS / DESCRIBE)."""

import asyncio
import base64
import errno
import hashlib
import re
import time
from dataclasses import dataclass, field
from urllib.parse import quote, unquote, urlsplit

from app.integrations.errors import IntegrationError

DEFAULT_RTSP_PORT = 554
USER_AGENT = "SztudioCore"
_MAX_RESPONSE_BYTES = 64 * 1024
_PATH_FORBIDDEN = re.compile(r"[\x00-\x20\x7f#]")


class RtspUrlError(IntegrationError):
    def __init__(self, message: str) -> None:
        super().__init__("rtsp_url_invalid", message)


def normalize_path(path: str | None) -> str:
    """Ścieżka RTSP z parametrami, zawsze zaczynająca się od „/”."""
    path = (path or "").strip()
    if not path:
        return "/"
    if "://" in path.split("?")[0]:
        raise RtspUrlError("W polu ścieżki podaj samą ścieżkę strumienia (np. /stream1), a nie pełny adres.")
    if _PATH_FORBIDDEN.search(path):
        raise RtspUrlError("Ścieżka strumienia zawiera niedozwolone znaki (spacje, znaki sterujące lub „#”).")
    if len(path) > 1024:
        raise RtspUrlError("Ścieżka strumienia jest zbyt długa.")
    return path if path.startswith("/") else f"/{path}"


def validate_port(port: int | None) -> int:
    value = DEFAULT_RTSP_PORT if port is None else port
    if not 1 <= value <= 65535:
        raise RtspUrlError("Port musi być liczbą z zakresu 1–65535.")
    return value


@dataclass(frozen=True)
class RtspTarget:
    """Rozłożony adres źródła RTSP. `password` nigdy nie powinno trafić do logów ani odpowiedzi API."""

    host: str
    port: int = DEFAULT_RTSP_PORT
    path: str = "/"
    username: str | None = None
    password: str | None = field(default=None, repr=False)

    def url(self, *, credentials: bool = False, host: str | None = None) -> str:
        """Adres `rtsp://…`. Z danymi logowania wyłącznie do przekazania go2rtc w sieci wewnętrznej."""
        target_host = host or self.host
        if ":" in target_host and not target_host.startswith("["):
            target_host = f"[{target_host}]"
        userinfo = ""
        if credentials and self.username:
            userinfo = quote(self.username, safe="")
            if self.password:
                userinfo += ":" + quote(self.password, safe="")
            userinfo += "@"
        return f"rtsp://{userinfo}{target_host}:{self.port}{self.path}"


def parse_rtsp_url(url: str) -> RtspTarget:
    """Rozkłada pełny adres RTSP. Dopuszczalny jest wyłącznie schemat `rtsp://`."""
    url = (url or "").strip()
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError as error:
        raise RtspUrlError("Adres RTSP jest nieprawidłowy.") from error
    if parts.scheme.lower() != "rtsp":
        raise RtspUrlError("Adres musi zaczynać się od rtsp:// – inne schematy nie są obsługiwane.")
    if not parts.hostname:
        raise RtspUrlError("Adres RTSP nie zawiera adresu urządzenia.")
    if parts.fragment:
        raise RtspUrlError("Adres RTSP nie może zawierać fragmentu „#”.")
    path = parts.path + (f"?{parts.query}" if parts.query else "")
    return RtspTarget(
        host=parts.hostname,
        port=validate_port(port),
        path=normalize_path(path),
        username=unquote(parts.username) if parts.username else None,
        password=unquote(parts.password) if parts.password else None,
    )


@dataclass
class ProbeResult:
    ok: bool
    code: str
    message: str
    response_time_ms: int | None = None
    #: Ścieżki mediów z opisu SDP, np. [{"media": "video", "codec": "H264"}].
    tracks: list[dict[str, str]] = field(default_factory=list)
    server: str | None = None


@dataclass
class _Response:
    status: int
    reason: str
    headers: dict[str, list[str]]
    body: str

    def header(self, name: str) -> str | None:
        values = self.headers.get(name.lower())
        return values[0] if values else None


async def _read_response(reader: asyncio.StreamReader) -> _Response:
    head = await reader.readuntil(b"\r\n\r\n")
    if len(head) > _MAX_RESPONSE_BYTES:
        raise IntegrationError("protocol_error", "Urządzenie zwróciło zbyt długą odpowiedź.")
    lines = head.decode("latin-1").split("\r\n")
    match = re.match(r"RTSP/\d\.\d\s+(\d{3})\s*(.*)", lines[0])
    if not match:
        raise IntegrationError("protocol_error", "Urządzenie nie odpowiedziało zgodnie z protokołem RTSP.")
    headers: dict[str, list[str]] = {}
    for line in lines[1:]:
        if ":" in line:
            name, value = line.split(":", 1)
            headers.setdefault(name.strip().lower(), []).append(value.strip())
    length = min(int(headers.get("content-length", ["0"])[0] or 0), _MAX_RESPONSE_BYTES)
    body = (await reader.readexactly(length)).decode("utf-8", "replace") if length else ""
    return _Response(int(match.group(1)), match.group(2), headers, body)


def _authorization(challenges: list[str], method: str, uri: str, username: str, password: str) -> str | None:
    """Nagłówek Authorization dla wyzwania Digest (preferowane) lub Basic."""
    digest = next((item for item in challenges if item.lower().startswith("digest")), None)
    if digest:
        params = dict(re.findall(r'(\w+)="?([^",]*)"?', digest))
        realm, nonce = params.get("realm", ""), params.get("nonce", "")
        if params.get("algorithm", "MD5").upper() != "MD5":
            return None

        def md5(text: str) -> str:
            return hashlib.md5(text.encode(), usedforsecurity=False).hexdigest()

        response = md5(f"{md5(f'{username}:{realm}:{password}')}:{nonce}:{md5(f'{method}:{uri}')}")
        return f'Digest username="{username}", realm="{realm}", nonce="{nonce}", uri="{uri}", response="{response}"'
    if any(item.lower().startswith("basic") for item in challenges):
        return "Basic " + base64.b64encode(f"{username}:{password}".encode()).decode()
    return None


def _parse_sdp_tracks(sdp: str) -> list[dict[str, str]]:
    tracks: list[dict[str, str]] = []
    payload_codecs = dict(re.findall(r"a=rtpmap:(\d+)\s+([^/\s]+)", sdp))
    for media, payload in re.findall(r"^m=(\w+)\s+\d+\s+\S+\s+(\d+)", sdp, re.M):
        tracks.append({"media": media, "codec": payload_codecs.get(payload, f"payload {payload}")})
    return tracks


_STATUS_ERRORS = {
    401: ("auth_failed", "Kamera odrzuciła login lub hasło."),
    403: ("forbidden", "Kamera odmówiła dostępu do strumienia (403)."),
    404: ("stream_not_found", "Kamera nie ma strumienia pod podaną ścieżką (404)."),
    454: ("stream_not_found", "Kamera nie zna takiej sesji lub ścieżki strumienia (454)."),
}


def _connection_error(error: Exception) -> IntegrationError:
    if isinstance(error, IntegrationError):
        return error
    if isinstance(error, asyncio.TimeoutError | TimeoutError):
        return IntegrationError("timeout", "Urządzenie nie odpowiedziało w wyznaczonym czasie.")
    if isinstance(error, ConnectionRefusedError):
        return IntegrationError("connection_refused", "Urządzenie odrzuciło połączenie – sprawdź port.")
    if isinstance(error, asyncio.IncompleteReadError | asyncio.LimitOverrunError | ConnectionResetError):
        return IntegrationError(
            "protocol_error", "Urządzenie zamknęło połączenie lub odpowiedziało niepoprawnie."
        )
    if isinstance(error, OSError) and error.errno in (errno.EHOSTUNREACH, errno.ENETUNREACH, errno.EHOSTDOWN):
        return IntegrationError("unreachable", "Urządzenie jest nieosiągalne w sieci.")
    return IntegrationError("connection_error", "Nie udało się połączyć z urządzeniem.")


async def _request(
    ip: str, port: int, method: str, uri: str, authorization: str | None, timeout: float
) -> _Response:
    reader, writer = await asyncio.wait_for(asyncio.open_connection(ip, port), timeout)
    try:
        lines = [f"{method} {uri} RTSP/1.0", "CSeq: 1", f"User-Agent: {USER_AGENT}"]
        if method == "DESCRIBE":
            lines.append("Accept: application/sdp")
        if authorization:
            lines.append(f"Authorization: {authorization}")
        writer.write(("\r\n".join(lines) + "\r\n\r\n").encode())
        await asyncio.wait_for(writer.drain(), timeout)
        return await asyncio.wait_for(_read_response(reader), timeout)
    finally:
        writer.close()
        try:
            await asyncio.wait_for(writer.wait_closed(), 1)
        except Exception:  # noqa: S110 – zamykanie połączenia nie może maskować wyniku
            pass


async def probe_rtsp(
    target: RtspTarget, ip: str, timeout: float = 5.0, method: str = "DESCRIBE"
) -> ProbeResult:
    """Sprawdza strumień RTSP: łączy się z `ip` (adres po weryfikacji polityki) i wysyła DESCRIBE.

    Nie pobiera obrazu – potwierdza osiągalność urządzenia, poprawność danych logowania
    i istnienie strumienia. `method="OPTIONS"` sprawdza samą usługę RTSP.
    """
    uri = target.url() if method == "DESCRIBE" else target.url().split("?")[0]
    started = time.monotonic()
    try:
        response = await _request(ip, target.port, method, uri, None, timeout)
        elapsed = int((time.monotonic() - started) * 1000)
        if response.status == 401:
            if not target.username:
                return ProbeResult(
                    False,
                    "auth_required",
                    "Kamera wymaga loginu i hasła.",
                    elapsed,
                    server=response.header("server"),
                )
            authorization = _authorization(
                response.headers.get("www-authenticate", []),
                method,
                uri,
                target.username,
                target.password or "",
            )
            if authorization is None:
                return ProbeResult(
                    False,
                    "auth_unsupported",
                    "Kamera wymaga nieobsługiwanej metody uwierzytelniania.",
                    elapsed,
                )
            response = await _request(ip, target.port, method, uri, authorization, timeout)
    except Exception as error:  # noqa: BLE001 – każdy błąd połączenia staje się wynikiem diagnostycznym
        failure = _connection_error(error)
        return ProbeResult(False, failure.code, failure.message)

    server = response.header("server")
    if response.status == 200:
        tracks = _parse_sdp_tracks(response.body) if method == "DESCRIBE" else []
        return ProbeResult(True, "ok", "Połączenie poprawne.", elapsed, tracks, server)
    code, message = _STATUS_ERRORS.get(
        response.status,
        ("rtsp_error", f"Kamera odpowiedziała błędem RTSP {response.status} {response.reason}".strip() + "."),
    )
    return ProbeResult(False, code, message, elapsed, server=server)


def quality_from_response_time(response_time_ms: int | None) -> int | None:
    """Wskaźnik jakości połączenia (0–100) wyznaczany z czasu odpowiedzi urządzenia."""
    if response_time_ms is None:
        return None
    for limit, quality in ((100, 100), (300, 85), (800, 65), (2000, 45)):
        if response_time_ms <= limit:
            return quality
    return 25
