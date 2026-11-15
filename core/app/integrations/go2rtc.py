"""Klient API go2rtc. API go2rtc jest dostępne wyłącznie w sieci wewnętrznej – panel nigdy z niego nie korzysta."""

import re
from dataclasses import dataclass
from typing import Any

import httpx

from app.integrations.errors import IntegrationError

_STREAM_NAME = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_CREDENTIALS_IN_URL = re.compile(r"//[^/@\s]*@")


def redact_url(url: str) -> str:
    """Usuwa dane logowania z adresu – do porównań i komunikatów."""
    return _CREDENTIALS_IN_URL.sub("//", url)


class Go2rtcError(IntegrationError):
    pass


@dataclass(frozen=True)
class Go2rtcStream:
    name: str
    #: Adresy źródeł bez danych logowania.
    sources: tuple[str, ...]
    #: Liczba aktywnych odbiorców (np. otwartych podglądów WebRTC).
    consumers: int
    #: Czy go2rtc ma w tej chwili otwarte połączenie ze źródłem.
    connected: bool


class Go2rtcClient:
    def __init__(
        self,
        base_url: str,
        username: str | None = None,
        password: str | None = None,
        timeout: float = 10.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        auth = httpx.BasicAuth(username, password or "") if username else None
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"), auth=auth, timeout=timeout, transport=transport, trust_env=False
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def _send(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        try:
            return await self._client.request(method, path, **kwargs)
        except httpx.TimeoutException as error:
            raise Go2rtcError("go2rtc_timeout", "go2rtc nie odpowiedział w wyznaczonym czasie.") from error
        except httpx.HTTPError as error:
            raise Go2rtcError("go2rtc_unavailable", "Brak połączenia z usługą go2rtc.") from error

    @staticmethod
    def _require_ok(response: httpx.Response, action: str) -> httpx.Response:
        if response.status_code == 401:
            raise Go2rtcError("go2rtc_auth_failed", "go2rtc odrzucił dane logowania Core.")
        if not response.is_success:
            detail = redact_url(response.text.strip())[:200]
            raise Go2rtcError(
                "go2rtc_error",
                f"go2rtc: {action} nie powiodło się ({response.status_code}). {detail}".strip(),
            )
        return response

    async def info(self) -> dict[str, Any]:
        """Informacje o usłudze (m.in. wersja) – służy też jako kontrola dostępności."""
        return self._require_ok(await self._send("GET", "/api"), "odczyt stanu").json()

    async def list_streams(self) -> dict[str, Go2rtcStream]:
        data = self._require_ok(await self._send("GET", "/api/streams"), "odczyt strumieni").json() or {}
        streams = {}
        for name, entry in data.items():
            producers = (entry or {}).get("producers") or []
            streams[name] = Go2rtcStream(
                name=name,
                sources=tuple(
                    redact_url(str(item.get("url", ""))).replace("//***@", "//") for item in producers
                ),
                consumers=len((entry or {}).get("consumers") or []),
                # Podłączone źródło ma w odpowiedzi go2rtc więcej niż sam adres (media, odbiorniki, …).
                connected=any(len(item) > 1 for item in producers),
            )
        return streams

    async def put_stream(self, name: str, source_url: str) -> None:
        """Dodaje lub zastępuje strumień. `source_url` zawiera dane logowania i nie może być logowany."""
        if not _STREAM_NAME.match(name):
            raise Go2rtcError("go2rtc_error", "Nieprawidłowa nazwa strumienia.")
        if not source_url.startswith("rtsp://"):
            # go2rtc obsługuje też źródła typu exec:/ffmpeg: – Core nigdy ich nie przekazuje.
            raise Go2rtcError("go2rtc_error", "Dozwolone są wyłącznie źródła rtsp://.")
        response = await self._send("PUT", "/api/streams", params={"name": name, "src": source_url})
        self._require_ok(response, "zapis strumienia")

    async def delete_stream(self, name: str) -> None:
        response = await self._send("DELETE", "/api/streams", params={"src": name})
        if response.status_code != 404:
            self._require_ok(response, "usunięcie strumienia")

    async def webrtc(self, name: str, offer_sdp: str) -> str:
        """Wymiana SDP: oferta przeglądarki → odpowiedź go2rtc."""
        response = await self._send(
            "POST",
            "/api/webrtc",
            params={"src": name},
            content=offer_sdp,
            headers={"Content-Type": "application/sdp"},
        )
        if response.status_code in (400, 404, 500) and "not found" in response.text.lower():
            raise Go2rtcError("stream_not_registered", "Strumień nie jest zarejestrowany w go2rtc.")
        if not response.is_success:
            detail = redact_url(response.text.strip())[:200]
            raise Go2rtcError(
                "stream_unavailable", f"go2rtc nie może otworzyć strumienia kamery. {detail}".strip()
            )
        return response.text
