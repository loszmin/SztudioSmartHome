# Android ↔ Sztudio Core – mapowanie API

Dokument opisuje, z których **istniejących** punktów Sztudio Core korzysta aplikacja Android.
Źródło: kod backendu (`core/app/api/*.py`, `core/app/ws.py`, `core/app/schemas.py`) – lista tras została
odczytana z wygenerowanej specyfikacji OpenAPI, nie z dokumentacji. Aplikacja nie dodaje ani nie zmienia
żadnego endpointu.

## Zasady wspólne

| Element | Zachowanie backendu | Obsługa w aplikacji |
| --- | --- | --- |
| Adres | Panel i API pod jednym adresem HTTPS (nginx: `/api/`, `/ws/`) | Użytkownik podaje `https://ADRES[:PORT]`; `http://` jest odrzucany |
| Format | JSON camelCase, daty ISO 8601 UTC (`…Z`) | kotlinx.serialization, `ignoreUnknownKeys` |
| Pola opcjonalne | Pole bez wartości jest **pomijane**; pola `signalQuality`, `lastSeenAt`, `lastUpdatedAt` przychodzą jako `null` | Wszystkie pola opcjonalne mają wartości domyślne |
| Uwierzytelnienie | `Authorization: Bearer <accessToken>` | Interceptor OkHttp |
| Błędy | `{"detail": "tekst"}`, `{"detail": {"code", "message"}}` lub lista błędów walidacji | `ApiError` z kodem HTTP, kodem diagnostycznym i komunikatem |
| 401 | Brak / nieważny / wygasły token, zmienione hasło | Wylogowanie lokalne i ekran logowania z komunikatem „Sesja wygasła” |
| 403 | Operacja wymaga roli `admin` | Komunikat „Brak uprawnień”; przyciski zmiany stanu ukryte dla roli `viewer` |
| 429 | Blokada logowania, nagłówek `Retry-After` | Odliczanie na ekranie logowania |

## Logowanie i sesja

| Funkcja | Endpoint | Uwagi |
| --- | --- | --- |
| Test adresu serwera | `GET /api/v1/health` → `{"status":"ok"}` | Publiczny; sprawdza też zaufanie do certyfikatu |
| Logowanie | `POST /api/v1/auth/login` `{username, password}` → `{accessToken, tokenType, expiresAt, user{id, username, role}}` | Token JWT; ważność wg `SZTUDIO_ACCESS_TOKEN_TTL_MINUTES` (domyślnie 7 dni) |
| Weryfikacja sesji przy starcie | `GET /api/v1/auth/me` → `{id, username, role}` | 401 = sesja nieważna |
| Wylogowanie | – (brak endpointu) | Token usuwany z urządzenia; serwer nie prowadzi listy sesji |

**Niewspierane przez backend:** odświeżanie tokenu (brak refresh tokena i endpointu odświeżania).
Aplikacja przechowuje `expiresAt`, sprawdza ważność przed żądaniami i przy 401 prosi o ponowne
zalogowanie. Unieważnienie tokenu na serwerze przy wylogowaniu – niedostępne.

## Ekrany

### Dashboard

| Dane | Źródło |
| --- | --- |
| Stan Core, wersja, czas pracy, usługi (w tym go2rtc) | `GET /api/v1/system/status` → `core`, `services[]` |
| Status uzbrojenia | `GET /api/v1/system/status` → `alarmSystem` |
| Kamery online / offline | `GET /api/v1/cameras` |
| Aktywne alarmy | `GET /api/v1/alarms?limit=50` (aktywne zawsze pierwsze) |
| Liczba czujników | `GET /api/v1/sensors` |
| Ostatnie zdarzenia | `GET /api/v1/events?limit=8` |
| Stan połączenia | Wynik ostatniego żądania + stan kanałów WebSocket |

### Kamery

| Funkcja | Źródło |
| --- | --- |
| Lista, status, jakość połączenia, profil, rozdzielczość | `GET /api/v1/cameras` → `status`, `signalQuality`, `streamState`, `streamProfile`, `resolution`, `fps`, `enabled`, `errorCode`, `errorMessage`, `lastSeenAt` |
| Podgląd WebRTC | `POST /api/v1/cameras/{id}/webrtc` – patrz niżej |
| Stan go2rtc | `GET /api/v1/system/status` → `services[key=go2rtc]` |
| Aktualizacje statusu | WebSocket `cameras` |

**Sygnalizacja WebRTC (rzeczywisty protokół):**

1. Aplikacja tworzy `PeerConnection` z transceiverami `video` i `audio` w trybie `RECV_ONLY`, bez serwerów STUN/TURN (sieć lokalna).
2. Tworzy ofertę, ustawia ją lokalnie i **czeka na zakończenie zbierania kandydatów ICE** (maks. 2 s) –
   backend nie obsługuje trickle ICE; kandydaci muszą być w SDP oferty.
3. `POST /api/v1/cameras/{id}/webrtc`, `Content-Type: application/sdp`, treść = pełne SDP oferty (maks. 64 KiB, musi zaczynać się od `v=`).
4. Odpowiedź `200`, `Content-Type: application/sdp` = SDP odpowiedzi go2rtc → `setRemoteDescription(ANSWER)`.
5. Media płyną bezpośrednio z go2rtc na porcie `SZTUDIO_WEBRTC_PORT` (domyślnie 8555 TCP/UDP) adresu `SZTUDIO_LAN_IP`.

Błędy sygnalizacji: `404` (brak kamery), `409` z `code` = `disabled` / `not_configured`, `502` z `code` =
`go2rtc_not_configured`, `go2rtc_unavailable`, `stream_unavailable`, `400` (`invalid_offer`). Restart go2rtc
jest obsługiwany po stronie Core (ponowna rejestracja strumienia przy kolejnej ofercie) – aplikacja po prostu
ponawia sesję. Aplikacja nigdy nie łączy się z go2rtc ani z kamerą i nie zna adresów RTSP.

**Niewspierane w aplikacji (tylko panel WWW, endpointy administracyjne istnieją):** dodawanie, edycja i usuwanie
kamer, test RTSP, wyszukiwanie ONVIF, rejestratory. Wersja 1 aplikacji Android jest klientem do monitorowania.

### Alarmy

| Funkcja | Źródło |
| --- | --- |
| Aktywne i historia | `GET /api/v1/alarms?limit=200` → `severity`, `status`, `source{type,name,id}`, `location`, `triggeredAt`, `acknowledgedAt`, `acknowledgedBy`, `resolvedAt` |
| Potwierdzenie | `POST /api/v1/alarms/{id}/acknowledge` (rola `admin`, idempotentne) |
| Tryb uzbrojenia | `GET /api/v1/alarms/arming`, `PUT /api/v1/alarms/arming` `{"mode": "disarmed" \| "armed_home" \| "armed_away"}` (rola `admin`) |
| Czas rzeczywisty | WebSocket `alarms`: `alarm.created`, `alarm.updated`, `arming.changed` |

Obie operacje zmieniające stan wymagają potwierdzenia w oknie dialogowym.

### Czujniki

| Funkcja | Źródło |
| --- | --- |
| Lista: nazwa, lokalizacja, typ, stan, wartość, jednostka, połączenie, bateria, ostatnia aktualizacja | `GET /api/v1/sensors` |
| Typy | `motion`, `contact`, `flood`, `smoke`, `temperature`, `vibration` – jedyne typy zwracane przez backend |
| Czas rzeczywisty | WebSocket `alarms`: `sensor.created` / `sensor.updated` / `sensor.deleted` |

### Historia

| Funkcja | Źródło |
| --- | --- |
| Zdarzenia | `GET /api/v1/events?category=&from=&to=&limit=` (od najnowszych, maks. 1000) |
| Filtr kategorii | `motion`, `camera_offline`, `device_online`, `door`, `alarm`, `restart` |
| Filtr dat | `from` / `to` w ISO 8601 |
| Alarmy | `GET /api/v1/alarms` (zakładka) |
| Awarie | kategoria `camera_offline` + alarmy o źródle `camera` / `network` / `system` |
| Czas rzeczywisty | WebSocket `events`: `event.created` |

### Diagnostyka

| Dane | Źródło |
| --- | --- |
| Stan Core, usługi | `GET /api/v1/system/status` |
| Stan go2rtc (wersja, liczba strumieni, błąd) | `GET /api/v1/diagnostics` → `go2rtc` |
| Monitor urządzeń | `GET /api/v1/diagnostics` → `monitor` |
| Kamery i rejestratory: status, ostatnia próba / udane połączenie, kod i opis błędu, czas odpowiedzi, stan strumienia | `GET /api/v1/diagnostics` → `devices[]` |
| Stan WebSocket | Mierzony przez aplikację (stan 4 połączeń) |
| Czas odpowiedzi API | **Mierzony przez aplikację** (czas ostatnich żądań REST) – backend go nie raportuje |
| Ostatnie błędy | Błędy urządzeń z `devices[]` + ostatnie błędy połączeń aplikacji |

`POST /api/v1/diagnostics/run` wymaga roli `admin` – dostępne jako „Sprawdź teraz”.

### Ustawienia i informacje

| Funkcja | Źródło |
| --- | --- |
| Adres serwera, test połączenia | `GET /api/v1/health` |
| Informacje o sesji | `GET /api/v1/auth/me`, przechowywane `expiresAt` |
| Wersja Core | `GET /api/v1/system/status` → `core.version` |
| Wygląd, wersja aplikacji, instrukcja CA | lokalnie |

**Niewspierane:** zmiana hasła z aplikacji (endpoint `POST /auth/change-password` istnieje, ale nie jest w zakresie v1),
zarządzanie tokenami API, użytkownikami.

## WebSocket

Adres: `wss://ADRES/ws/v1/{kanał}?token=<accessToken>` (przeglądarki i aplikacja nie ustawiają nagłówka dla WS).
Kanały: `events`, `system`, `cameras`, `alarms`. Po połączeniu serwer wysyła `{"type":"connected"}`.
Komunikat: `{"type": "...", "data": {...}, "timestamp": "..."}`. Klient nic nie wysyła.

| Kod zamknięcia | Znaczenie | Reakcja aplikacji |
| --- | --- | --- |
| `4401` | Nieprawidłowy token | Wylogowanie (sesja nieważna), bez ponawiania |
| `4404` | Nieznany kanał | Błąd programisty – bez ponawiania |
| inne / zerwanie | Utrata sieci, restart Core | Ponawianie z odstępem 1, 2, 4 … 30 s; natychmiast po odzyskaniu sieci |

| Kanał | Typy | Co odświeża aplikacja |
| --- | --- | --- |
| `events` | `event.created` | historia, ostatnie zdarzenia |
| `alarms` | `alarm.created`, `alarm.updated`, `arming.changed`, `sensor.*` | alarmy, status systemu, czujniki |
| `cameras` | `camera.created` / `updated` / `deleted` | kamery, diagnostyka |
| `system` | `recorder.*`, `network.*` | diagnostyka |

Tak jak panel WWW, aplikacja traktuje komunikat jako sygnał do ponownego pobrania zasobu przez REST
(dane z komunikatu nie zastępują odpowiedzi REST). WebSocket jest otwarty tylko, gdy aplikacja jest na pierwszym planie.

## Funkcje bez odpowiednika w backendzie

| Funkcja | Stan |
| --- | --- |
| Odświeżanie tokenu | Brak w backendzie – ponowne logowanie po wygaśnięciu |
| Wylogowanie po stronie serwera | Brak – token usuwany tylko z urządzenia |
| Powiadomienia push w tle | Brak w backendzie (FCM wymagałby internetu) – alerty tylko przy otwartej aplikacji |
| Nagrania, PTZ, migawki z serwera | Brak w backendzie |
| Czas odpowiedzi API raportowany przez serwer | Brak – mierzy aplikacja |
