"""Atrapy urządzeń do testów: serwer RTSP, urządzenie ONVIF (SOAP + WS-Discovery) i go2rtc.

Atrapy mówią prawdziwymi protokołami przez prawdziwe gniazda na 127.0.0.1, dzięki czemu testy
ćwiczą kod sieciowy Core. Nie zastępują testów z rzeczywistym sprzętem.
"""

import asyncio
import base64
import hashlib
import re
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from aiohttp import web

from app.integrations.go2rtc import Go2rtcError, Go2rtcStream, redact_url


class LoopThread:
    """Pętla asyncio w osobnym wątku – gospodarz serwerów-atrap."""

    def __init__(self) -> None:
        self.loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self.loop.run_forever, daemon=True)
        self._thread.start()

    def run(self, coroutine: Any) -> Any:
        return asyncio.run_coroutine_threadsafe(coroutine, self.loop).result(10)

    def stop(self) -> None:
        self.loop.call_soon_threadsafe(self.loop.stop)
        self._thread.join(5)


# ---------- RTSP ----------

SDP = (
    "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=Atrapa\r\nt=0 0\r\n"
    "m=video 0 RTP/AVP 96\r\na=rtpmap:96 H264/90000\r\na=control:track1\r\n"
    "m=audio 0 RTP/AVP 97\r\na=rtpmap:97 MPEG4-GENERIC/16000\r\na=control:track2\r\n"
)


@dataclass
class FakeRtspServer:
    """Minimalny serwer RTSP: OPTIONS i DESCRIBE, uwierzytelnianie Digest lub Basic."""

    username: str | None = "kamera"
    password: str = "tajne-haslo"
    auth: str = "digest"  # digest | basic
    paths: tuple[str, ...] = ("/stream1", "/cam/realmonitor?channel=1&subtype=0")
    #: Zachowanie specjalne: None | "hang" (brak odpowiedzi) | "garbage" (odpowiedź spoza protokołu)
    mode: str | None = None
    requests: list[str] = field(default_factory=list)
    port: int = 0
    _server: asyncio.AbstractServer | None = None
    _tasks: set = field(default_factory=set)

    async def start(self) -> None:
        # Ponowne uruchomienie zajmuje ten sam port – tak testujemy powrót urządzenia do sieci.
        self._server = await asyncio.start_server(self._handle, "127.0.0.1", self.port, reuse_address=True)
        self.port = self._server.sockets[0].getsockname()[1]

    async def stop(self) -> None:
        if self._server:
            self._server.close()
            self._server = None
        # Otwarte połączenia (np. celowo zawieszone) są przerywane, żeby zwolnić port.
        for task in list(self._tasks):
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()

    def _authorized(self, method: str, uri: str, header: str | None) -> bool:
        if self.username is None:
            return True
        if not header:
            return False
        if header.startswith("Basic "):
            return base64.b64decode(header[6:]).decode() == f"{self.username}:{self.password}"
        params = dict(re.findall(r'(\w+)="([^"]*)"', header))

        def md5(text: str) -> str:
            return hashlib.md5(text.encode()).hexdigest()

        expected = md5(f"{md5(f'{self.username}:atrapa:{self.password}')}:nonce123:{md5(f'{method}:{uri}')}")
        return params.get("username") == self.username and params.get("response") == expected

    async def _handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        task = asyncio.current_task()
        self._tasks.add(task)
        try:
            await self._serve(reader, writer)
        except (asyncio.IncompleteReadError, ConnectionError, asyncio.CancelledError):
            pass
        finally:
            self._tasks.discard(task)
            writer.close()

    async def _serve(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        if True:
            head = (await reader.readuntil(b"\r\n\r\n")).decode()
            if self.mode == "hang":
                await asyncio.sleep(30)
                return
            if self.mode == "garbage":
                writer.write(b"HTTP/1.1 400 Bad Request\r\n\r\n")
                return
            lines = head.split("\r\n")
            method, uri, _ = lines[0].split(" ")
            self.requests.append(lines[0])
            headers = {
                k.lower(): v.strip() for k, v in (line.split(":", 1) for line in lines[1:] if ":" in line)
            }
            path = "/" + uri.split("/", 3)[3] if uri.count("/") >= 3 else "/"

            def reply(status: str, extra: str = "", body: str = "") -> None:
                writer.write(
                    f"RTSP/1.0 {status}\r\nCSeq: {headers.get('cseq', '1')}\r\nServer: AtrapaRTSP/1.0\r\n{extra}"
                    f"Content-Length: {len(body.encode())}\r\n\r\n{body}".encode()
                )

            if not self._authorized(method, uri, headers.get("authorization")):
                challenge = (
                    'Digest realm="atrapa", nonce="nonce123"'
                    if self.auth == "digest"
                    else 'Basic realm="atrapa"'
                )
                reply("401 Unauthorized", f"WWW-Authenticate: {challenge}\r\n")
            elif method == "OPTIONS":
                reply("200 OK", "Public: OPTIONS, DESCRIBE, SETUP, PLAY, TEARDOWN\r\n")
            elif method == "DESCRIBE" and path in self.paths:
                reply("200 OK", "Content-Type: application/sdp\r\n", SDP)
            else:
                reply("404 Not Found")
            await writer.drain()


# ---------- ONVIF ----------

_ENVELOPE = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:ter="http://www.onvif.org/ver10/error" xmlns:tds="http://www.onvif.org/ver10/device/wsdl" '
    'xmlns:trt="http://www.onvif.org/ver10/media/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">'
    "<s:Body>{body}</s:Body></s:Envelope>"
)
_FAULT = (
    "<s:Fault><s:Code><s:Value>s:Sender</s:Value><s:Subcode><s:Value>ter:NotAuthorized</s:Value></s:Subcode></s:Code>"
    '<s:Reason><s:Text xml:lang="en">Sender not Authorized</s:Text></s:Reason></s:Fault>'
)


@dataclass
class FakeOnvifProfile:
    token: str
    name: str
    source: str
    width: int
    height: int
    path: str
    encoding: str = "H264"
    fps: int = 20
    #: False = urządzenie odmawia podania adresu strumienia dla tego profilu.
    has_uri: bool = True


DEFAULT_PROFILES = (
    FakeOnvifProfile("prof_main", "Strumień główny", "src_1", 2560, 1440, "/onvif/main"),
    FakeOnvifProfile("prof_sub", "Strumień pomocniczy", "src_1", 640, 360, "/onvif/sub"),
)


@dataclass
class FakeOnvifDevice:
    """Urządzenie ONVIF: usługi device i media przez SOAP z WS-UsernameToken oraz odpowiedź WS-Discovery."""

    username: str = "admin"
    password: str = "onvif-haslo"
    manufacturer: str = "BCS"
    model: str = "ATRAPA-NVR"
    profiles: tuple[FakeOnvifProfile, ...] = DEFAULT_PROFILES
    rtsp_port: int = 554
    #: Host, który urządzenie wpisuje w adresy strumieni (celowo inny niż rzeczywisty – Core ma go ignorować).
    advertised_host: str = "203.0.113.77"
    media_service: bool = True
    calls: list[str] = field(default_factory=list)
    port: int = 0
    discovery_port: int = 0
    _runner: web.AppRunner | None = None
    _discovery: asyncio.DatagramTransport | None = None

    async def start(self) -> None:
        app = web.Application()
        app.router.add_post("/onvif/{service}", self._soap)
        self._runner = web.AppRunner(app)
        await self._runner.setup()
        site = web.TCPSite(self._runner, "127.0.0.1", 0)
        await site.start()
        self.port = self._runner.addresses[0][1]
        device = self

        class Responder(asyncio.DatagramProtocol):
            def connection_made(self, transport: asyncio.DatagramTransport) -> None:
                self.transport = transport

            def datagram_received(self, data: bytes, addr: tuple) -> None:
                if b"Probe" in data:
                    self.transport.sendto(device.probe_match().encode(), addr)

        self._discovery, _ = await asyncio.get_running_loop().create_datagram_endpoint(
            Responder, local_addr=("127.0.0.1", 0)
        )
        self.discovery_port = self._discovery.get_extra_info("sockname")[1]

    async def stop(self) -> None:
        if self._discovery:
            self._discovery.close()
        if self._runner:
            await self._runner.cleanup()

    def probe_match(self) -> str:
        return (
            '<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" '
            'xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing" '
            'xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl">'
            "<s:Body><d:ProbeMatches><d:ProbeMatch>"
            "<a:EndpointReference><a:Address>urn:uuid:atrapa-0001</a:Address></a:EndpointReference>"
            "<d:Types>dn:NetworkVideoTransmitter</d:Types>"
            f"<d:Scopes>onvif://www.onvif.org/name/{self.manufacturer}%20Atrapa onvif://www.onvif.org/hardware/{self.model} "
            "onvif://www.onvif.org/location/Garaz</d:Scopes>"
            # Adres w treści wskazuje obcy host – Core ma użyć adresu źródłowego pakietu.
            f"<d:XAddrs>http://{self.advertised_host}:{self.port}/onvif/device_service</d:XAddrs>"
            "</d:ProbeMatch></d:ProbeMatches></s:Body></s:Envelope>"
        )

    def _authorized(self, body: str) -> bool:
        username = re.search(r"Username[^>]*>([^<]+)<", body)
        digest = re.search(r"Password[^>]*>([^<]+)<", body)
        nonce = re.search(r"Nonce[^>]*>([^<]+)<", body)
        created = re.search(r"Created[^>]*>([^<]+)<", body)
        if not (username and digest and nonce and created):
            return False
        expected = base64.b64encode(
            hashlib.sha1(
                base64.b64decode(nonce.group(1)) + created.group(1).encode() + self.password.encode()
            ).digest()
        ).decode()
        return username.group(1) == self.username and digest.group(1) == expected

    async def _soap(self, request: web.Request) -> web.Response:
        body = await request.text()
        action = re.search(r"Body[^>]*>\s*<(?:\w+:)?(\w+)", body)
        name = action.group(1) if action else ""
        self.calls.append(name)
        base = f"http://{self.advertised_host}:{self.port}/onvif"

        def respond(inner: str, status: int = 200) -> web.Response:
            return web.Response(
                text=_ENVELOPE.format(body=inner), status=status, content_type="application/soap+xml"
            )

        if name == "GetSystemDateAndTime":
            now = datetime.now(UTC)
            return respond(
                "<tds:GetSystemDateAndTimeResponse><tds:SystemDateAndTime><tt:DateTimeType>NTP</tt:DateTimeType>"
                "<tt:DaylightSavings>false</tt:DaylightSavings><tt:UTCDateTime>"
                f"<tt:Time><tt:Hour>{now.hour}</tt:Hour><tt:Minute>{now.minute}</tt:Minute><tt:Second>{now.second}</tt:Second></tt:Time>"
                f"<tt:Date><tt:Year>{now.year}</tt:Year><tt:Month>{now.month}</tt:Month><tt:Day>{now.day}</tt:Day></tt:Date>"
                "</tt:UTCDateTime></tds:SystemDateAndTime></tds:GetSystemDateAndTimeResponse>"
            )
        if not self._authorized(body):
            return respond(_FAULT, status=400)
        if name == "GetServices":
            services = [("http://www.onvif.org/ver10/device/wsdl", "device_service")]
            if self.media_service:
                services.append(("http://www.onvif.org/ver10/media/wsdl", "media_service"))
            return respond(
                "<tds:GetServicesResponse>"
                + "".join(
                    f"<tds:Service><tds:Namespace>{ns}</tds:Namespace><tds:XAddr>{base}/{path}</tds:XAddr>"
                    "<tds:Version><tt:Major>2</tt:Major><tt:Minor>40</tt:Minor></tds:Version></tds:Service>"
                    for ns, path in services
                )
                + "</tds:GetServicesResponse>"
            )
        if name == "GetDeviceInformation":
            return respond(
                f"<tds:GetDeviceInformationResponse><tds:Manufacturer>{self.manufacturer}</tds:Manufacturer>"
                f"<tds:Model>{self.model}</tds:Model><tds:FirmwareVersion>1.2.3</tds:FirmwareVersion>"
                "<tds:SerialNumber>SN0001</tds:SerialNumber><tds:HardwareId>HW1</tds:HardwareId>"
                "</tds:GetDeviceInformationResponse>"
            )
        if name == "GetProfiles":
            return respond(
                "<trt:GetProfilesResponse>"
                + "".join(
                    f'<trt:Profiles token="{p.token}" fixed="true"><tt:Name>{p.name}</tt:Name>'
                    f'<tt:VideoSourceConfiguration token="vsc_{p.source}"><tt:Name>vs</tt:Name><tt:UseCount>2</tt:UseCount>'
                    f'<tt:SourceToken>{p.source}</tt:SourceToken><tt:Bounds x="0" y="0" width="{p.width}" height="{p.height}"/>'
                    "</tt:VideoSourceConfiguration>"
                    f'<tt:VideoEncoderConfiguration token="vec_{p.token}"><tt:Name>ve</tt:Name><tt:UseCount>1</tt:UseCount>'
                    f"<tt:Encoding>{p.encoding}</tt:Encoding><tt:Resolution><tt:Width>{p.width}</tt:Width>"
                    f"<tt:Height>{p.height}</tt:Height></tt:Resolution><tt:Quality>5</tt:Quality>"
                    f"<tt:RateControl><tt:FrameRateLimit>{p.fps}</tt:FrameRateLimit><tt:EncodingInterval>1</tt:EncodingInterval>"
                    "<tt:BitrateLimit>4096</tt:BitrateLimit></tt:RateControl>"
                    "<tt:Multicast><tt:Address><tt:Type>IPv4</tt:Type><tt:IPv4Address>0.0.0.0</tt:IPv4Address></tt:Address>"
                    "<tt:Port>0</tt:Port><tt:TTL>1</tt:TTL><tt:AutoStart>false</tt:AutoStart></tt:Multicast>"
                    "<tt:SessionTimeout>PT60S</tt:SessionTimeout></tt:VideoEncoderConfiguration></trt:Profiles>"
                    for p in self.profiles
                )
                + "</trt:GetProfilesResponse>"
            )
        if name == "GetStreamUri":
            token = re.search(r"ProfileToken[^>]*>([^<]+)<", body)
            profile = next((p for p in self.profiles if token and p.token == token.group(1)), None)
            if profile is None or not profile.has_uri:
                return respond(
                    _FAULT.replace("NotAuthorized", "NoProfile").replace(
                        "Sender not Authorized", "No profile"
                    ),
                    400,
                )
            return respond(
                "<trt:GetStreamUriResponse><trt:MediaUri>"
                f"<tt:Uri>rtsp://{self.advertised_host}:{self.rtsp_port}{profile.path}</tt:Uri>"
                "<tt:InvalidAfterConnect>false</tt:InvalidAfterConnect><tt:InvalidAfterReboot>false</tt:InvalidAfterReboot>"
                "<tt:Timeout>PT0S</tt:Timeout></trt:MediaUri></trt:GetStreamUriResponse>"
            )
        return respond(_FAULT.replace("NotAuthorized", "ActionNotSupported"), status=400)


# ---------- go2rtc ----------


class FakeGo2rtc:
    """Atrapa klienta go2rtc: pamięta strumienie tak, jak robi to prawdziwa usługa."""

    def __init__(self) -> None:
        self.streams: dict[str, str] = {}
        self.available = True
        self.offers: list[tuple[str, str]] = []
        self.answer: Callable[[str], str] = lambda name: f"v=0\r\ns=answer-{name}\r\n"

    def _check(self) -> None:
        if not self.available:
            raise Go2rtcError("go2rtc_unavailable", "Brak połączenia z usługą go2rtc.")

    async def close(self) -> None:
        pass

    async def info(self) -> dict[str, Any]:
        self._check()
        return {"version": "atrapa"}

    async def list_streams(self) -> dict[str, Go2rtcStream]:
        self._check()
        return {name: Go2rtcStream(name, (redact_url(url),), 0, False) for name, url in self.streams.items()}

    async def put_stream(self, name: str, source_url: str) -> None:
        self._check()
        self.streams[name] = source_url

    async def delete_stream(self, name: str) -> None:
        self._check()
        self.streams.pop(name, None)

    async def webrtc(self, name: str, offer_sdp: str) -> str:
        self._check()
        if name not in self.streams:
            raise Go2rtcError("stream_not_registered", "Strumień nie jest zarejestrowany w go2rtc.")
        self.offers.append((name, offer_sdp))
        return self.answer(name)
