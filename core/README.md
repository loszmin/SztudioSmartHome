# Sztudio Core

Backend systemu Sztudio Smart Home: REST API, WebSocket, uwierzytelnianie oraz integracje
z kamerami (RTSP, ONVIF), usługą strumieni go2rtc i rejestratorami BCS.
Python 3.12, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL, onvif-zeep-async, httpx.

> **Stan sprzętowy:** integracje działają z atrapami protokołów (testy) i z testowym źródłem RTSP
> (stos Docker). Nie były sprawdzane z rzeczywistą kamerą ani rejestratorem BCS – zob.
> [docs/weryfikacja.md](../docs/weryfikacja.md). Integracja BCS nie używa API producenta –
> zob. [docs/bcs.md](../docs/bcs.md). MQTT nie jest zaimplementowane.

## Uruchomienie

### Docker Compose (zalecane)

Z katalogu głównego repozytorium – zob. [README](../README.md#szybki-start).
Kontener przy starcie stosuje migracje (`alembic upgrade head`) i uruchamia uvicorn jako użytkownik bez uprawnień roota.

### Lokalnie

Wymagany Python 3.12+ i PostgreSQL.

```bash
cd core
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
export SZTUDIO_DATABASE_URL=postgresql+psycopg://sztudio:HASLO@127.0.0.1:5432/sztudio
export SZTUDIO_SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")
.venv/bin/alembic upgrade head
.venv/bin/python -m app.cli create-admin --username admin
.venv/bin/uvicorn app.main:app_factory --factory --port 8000
```

`SZTUDIO_SECRET_KEY` musi być stały między uruchomieniami (zapisz go) – zob. „Bezpieczeństwo”.

## Konfiguracja

| Zmienna | Domyślnie | Opis |
| --- | --- | --- |
| `SZTUDIO_DATABASE_URL` | – (wymagana) | `postgresql+psycopg://użytkownik:hasło@host:5432/baza` |
| `SZTUDIO_SECRET_KEY` | – (wymagana, ≥ 32 znaki) | Źródło kluczy: podpis tokenów dostępu i szyfrowanie haseł urządzeń |
| `SZTUDIO_ENVIRONMENT` | `production` | `development` włącza `/api/docs` i pozwala załadować dane demonstracyjne |
| `SZTUDIO_ADMIN_USERNAME`, `SZTUDIO_ADMIN_PASSWORD` | – | Konto tworzone przy starcie, gdy baza nie ma użytkowników. Brak wartości = brak konta (nie ma hasła domyślnego) |
| `SZTUDIO_ACCESS_TOKEN_TTL_MINUTES` | `10080` (7 dni) | Ważność tokenu po zalogowaniu |
| `SZTUDIO_LOGIN_MAX_ATTEMPTS` / `SZTUDIO_LOGIN_LOCKOUT_SECONDS` | `5` / `60` | Blokada po nieudanych logowaniach (na login + adres) |
| `SZTUDIO_CORS_ORIGINS` | puste | Originy rozdzielone przecinkami; potrzebne tylko, gdy panel działa pod innym adresem niż Core |
| `SZTUDIO_GO2RTC_URL`, `SZTUDIO_GO2RTC_USERNAME`, `SZTUDIO_GO2RTC_PASSWORD` | puste | API go2rtc w sieci wewnętrznej (Compose: `http://go2rtc:1984`). Puste = brak podglądu obrazu |
| `SZTUDIO_ALLOWED_DEVICE_NETWORKS` | `10.0.0.0/8,172.16.0.0/12,192.168.0.0/16` | Sieci, z którymi Core może się łączyć jako z urządzeniami (ochrona przed SSRF) |
| `SZTUDIO_DENIED_DEVICE_NETWORKS` | puste | Sieci wykluczone mimo dopasowania (Compose: wewnętrzna sieć z bazą i go2rtc) |
| `SZTUDIO_MONITOR_INTERVAL_SECONDS` | `30` | Cykl kontroli urządzeń i synchronizacji strumieni; `0` wyłącza monitor |
| `SZTUDIO_MONITOR_FAILURE_THRESHOLD` | `2` | Liczba kolejnych nieudanych prób, po której urządzenie jest offline |
| `SZTUDIO_DEVICE_TIMEOUT_SECONDS` | `5` | Limit czasu pojedynczego połączenia z urządzeniem |
| `SZTUDIO_DISCOVERY_MAX_HOSTS` | `1024` | Największa podsieć w jednym skanie ONVIF |

## Polecenia administracyjne

```bash
python -m app.cli create-admin --username admin
```

```bash
python -m app.cli reset-password --username admin
```

```bash
python -m app.cli seed-demo
```

```bash
python -m app.cli ensure-certs --dir certs/public --ca-dir certs/ca --hosts 192.168.1.10,sztudio.lan
```

Hasło jest wczytywane z klawiatury albo ze zmiennej `SZTUDIO_ADMIN_PASSWORD` (min. 10 znaków), nigdy z argumentów.
`seed-demo` ładuje dane przykładowe **tylko** przy `SZTUDIO_ENVIRONMENT=development` i tylko do pustej bazy –
w trybie produkcyjnym odmawia. `ensure-certs` tworzy lokalny urząd i certyfikat HTTPS (w Compose robi to
usługa `certs` przy każdym starcie) – zob. [docs/https-i-certyfikaty.md](../docs/https-i-certyfikaty.md).
W Compose: `docker compose exec core python -m app.cli …`.

## Kontrakt API

JSON w camelCase, daty ISO 8601 UTC (`…Z`). Schematy: [`app/schemas.py`](app/schemas.py) – odpowiadają typom
panelu z [`src/types/api.ts`](../src/types/api.ts). Pola opcjonalne w typach panelu (`pole?:`) są pomijane, gdy
nie mają wartości; pola typu `| null` (`signalQuality`, `lastSeenAt`, `lastUpdatedAt`) są zwracane jako `null`.

Uwierzytelnienie: nagłówek `Authorization: Bearer <token>`. Bez tokenu dostępne są wyłącznie
`POST /auth/login` i `GET /health`. **A** = wymaga roli `admin`; pozostałe punkty – dowolny uwierzytelniony.

| Metoda | Ścieżka (`/api/v1`) | | Opis |
| --- | --- | --- | --- |
| GET | `/health` | publiczny | `{"status":"ok"}` – kontrola stanu |
| POST | `/auth/login` | publiczny | `{username, password}` → `{accessToken, tokenType, expiresAt, user}` |
| GET | `/auth/me` | | Bieżący użytkownik |
| POST | `/auth/change-password` | | Zmiana hasła; unieważnia wszystkie wydane tokeny dostępu |
| GET / POST | `/auth/tokens` | A | Lista / utworzenie tokenu API (`{name, role}`); wartość tokenu zwracana tylko raz |
| DELETE | `/auth/tokens/{id}` | A | Unieważnienie tokenu API |
| GET | `/system/status` | | `SystemStatus`: stan Core, zasoby hosta, usługi, tryb uzbrojenia |
| GET | `/devices` | | `Device[]` – widok zbiorczy: Core, rejestratory, kamery |
| GET | `/cameras` | | `Camera[]` – bez adresów źródłowych i danych logowania |
| GET | `/cameras/{id}/config` | A | `CameraConfig`: host, port i ścieżka RTSP, login, `hasPassword` (hasło nigdy) |
| POST / PATCH / DELETE | `/cameras`, `/cameras/{id}` | A | Konfiguracja kamery; zapis od razu testuje połączenie i rejestruje strumień w go2rtc |
| POST | `/cameras/test` | A | Test połączenia RTSP przed zapisem → `{ok, code, message, responseTimeMs, tracks}` |
| POST | `/cameras/{id}/check` | A | Kontrola połączenia teraz (aktualizuje stan kamery) |
| POST | `/cameras/{id}/webrtc` | | Sygnalizacja WebRTC: `application/sdp` (oferta) → `application/sdp` (odpowiedź) |
| POST | `/onvif/discover` | A | WS-Discovery: `{mode: "multicast" \| "subnet", network?}` |
| POST | `/onvif/inspect` | A | Producent, model, profile mediów i port/ścieżka RTSP: `{host, port, username, password}` |
| GET | `/recorders`, `/recorders/{id}` | | Rejestratory (bez hasła – tylko `hasPassword`), wynik weryfikacji protokołów |
| POST / PATCH / DELETE | `/recorders`, `/recorders/{id}` | A | Konfiguracja rejestratora (`series`: `bcs_point` / `bcs_line` / `other`) |
| POST | `/recorders/test` | A | Weryfikacja HTTP / RTSP / ONVIF przed zapisem |
| POST | `/recorders/{id}/check` | A | Weryfikacja protokołów teraz |
| GET | `/recorders/{id}/channels` | A | Kanały z ONVIF lub z szablonu ścieżki (`origin`) |
| POST | `/recorders/{id}/channels/import` | A | Dodanie kanałów jako kamer: `{channels: [{number, name?, profile?}]}` |
| GET | `/recorders/integration-info` | | Stan adapterów (`hardwareVerified`), wymagane informacje, funkcje niedostępne |
| GET | `/diagnostics` | | Stan go2rtc, monitora i połączeń każdego urządzenia |
| POST | `/diagnostics/run` | A | Natychmiastowa kontrola wszystkich urządzeń |
| GET | `/alarms?limit=` | | `Alarm[]` – aktywne zawsze przed historią |
| POST | `/alarms` | A | Zgłoszenie alarmu |
| POST | `/alarms/{id}/acknowledge` | A | Potwierdzenie (idempotentne) → `Alarm` |
| POST | `/alarms/{id}/resolve` | A | Zamknięcie alarmu |
| GET / PUT | `/alarms/arming` | PUT: A | Tryb uzbrojenia: `disarmed` / `armed_home` / `armed_away` |
| GET | `/sensors` | | `Sensor[]` |
| POST / PATCH / DELETE | `/sensors`, `/sensors/{id}` | A | Konfiguracja czujnika |
| POST | `/sensors/{id}/reading` | A | Odczyt `{state, value?, batteryPercent?}` – uruchamia reguły alarmów |
| GET | `/events?category=&from=&to=&limit=` | | `SystemEvent[]` od najnowszych (domyślnie 200, maks. 1000) |
| POST | `/events` | A | Zapis zdarzenia |
| GET | `/network/devices` | | `NetworkDevice[]` |
| POST / PATCH / DELETE | `/network/devices`, `/network/devices/{id}` | A | Ręczna lista urządzeń sieci |

Przy `SZTUDIO_ENVIRONMENT=development` pełna specyfikacja OpenAPI jest pod `/api/docs`.

### Reguły alarmów (odczyty czujników)

| Czujnik w stanie aktywnym | Rozbrojony | Tryb domowy | Pełna ochrona |
| --- | --- | --- | --- |
| Dym, zalanie | krytyczny | krytyczny | krytyczny |
| Temperatura poza zakresem | ostrzeżenie | ostrzeżenie | ostrzeżenie |
| Drzwi / okna, wibracje | – | krytyczny | krytyczny |
| Ruch | – | – | krytyczny |

Jeden aktywny alarm na czujnik. Przejście kamery w `offline` (po `SZTUDIO_MONITOR_FAILURE_THRESHOLD` kolejnych
nieudanych próbach) tworzy zdarzenie i alarm krytyczny; powrót `online` zamyka alarm.
O tym, czy temperatura jest „poza zakresem”, decyduje zgłaszający odczyt – Core nie ma jeszcze konfiguracji progów.

### WebSocket

`/ws/v1/events`, `/ws/v1/system`, `/ws/v1/cameras`, `/ws/v1/alarms` – token w parametrze `?token=`
(przeglądarki nie pozwalają ustawić nagłówka). Nieprawidłowy token zamyka połączenie kodem `4401`.
Komunikaty: `{"type": "...", "data": {...}, "timestamp": "..."}`, wysyłane po zatwierdzeniu transakcji.

| Kanał | Typy komunikatów |
| --- | --- |
| `events` | `event.created` |
| `alarms` | `alarm.created`, `alarm.updated`, `arming.changed`, `sensor.created` / `updated` / `deleted` |
| `cameras` | `camera.created` / `updated` / `deleted` (także zmiany stanu z monitora) |
| `system` | `recorder.*`, `network.*` |

Po połączeniu serwer wysyła `connected`. Rejestr połączeń jest w pamięci procesu, dlatego Core działa jako **jeden worker**.

## Bezpieczeństwo

- Hasła użytkowników: Argon2id. Tokeny API: w bazie tylko skrót SHA-256.
- Hasła kamer i rejestratorów są szyfrowane (Fernet, klucz wyprowadzony z `SZTUDIO_SECRET_KEY`) i **nigdy nie są
  zwracane przez API**. Lista kamer nie zawiera adresów źródłowych; pełną konfigurację (bez hasła) widzi tylko administrator.
  Utrata lub zmiana `SZTUDIO_SECRET_KEY` oznacza konieczność ponownego wpisania haseł urządzeń.
- **go2rtc**: Core rejestruje strumienie przez API w sieci wewnętrznej; go2rtc trzyma je w pamięci (plik roboczy na tmpfs).
  Port API go2rtc nie jest publikowany, a przeglądarka nigdy nie łączy się z go2rtc – sygnalizacja WebRTC idzie przez
  uwierzytelniony punkt Core. Core przekazuje go2rtc wyłącznie źródła `rtsp://` (go2rtc potrafi uruchamiać polecenia
  systemowe jako źródła) i zawsze ze zweryfikowanym adresem IP, nie nazwą.
- **SSRF**: każde połączenie z urządzeniem (test, monitor, ONVIF, go2rtc, skan) przechodzi przez `AddressPolicy` –
  dozwolone są tylko sieci z `SZTUDIO_ALLOWED_DEVICE_NETWORKS`; pętla zwrotna, link-local, multicast i sieci wykluczone
  są odrzucane. Nazwy hostów są rozwiązywane przy każdym użyciu i sprawdzany jest każdy zwrócony adres. Adresy
  podane przez urządzenia (ONVIF XAddrs, URI strumieni, WS-Discovery) są ignorowane – używany jest adres, z którym
  Core faktycznie rozmawia.
- **Logi**: tokeny (`token=***`) i dane logowania w adresach RTSP (także zakodowanych) są maskowane na wszystkich wyjściach;
  logi INFO bibliotek HTTP są wyłączone, bo zawierają pełne adresy żądań.
- Odpowiedzi XML z sieci (WS-Discovery) są parsowane przez `defusedxml`.
- Dokumentacja `/api/docs` jest wyłączona w trybie produkcyjnym.
- Core nie szyfruje ruchu sam – w Compose HTTPS zapewnia nginx (usługa `web`), a Core nie jest dostępny spoza sieci wewnętrznej.

## Testy

Testy integracyjne działają na prawdziwym PostgreSQL; schemat budują migracje Alembic.
**Wskazana baza jest czyszczona** – użyj osobnej.

Urządzenia są zastąpione atrapami w `tests/fakes.py`, które mówią prawdziwymi protokołami przez gniazda
na 127.0.0.1: serwer RTSP (Digest/Basic, DESCRIBE/SDP), urządzenie ONVIF (SOAP z WS-UsernameToken, odpowiedzi
WS-Discovery) i go2rtc. Kod sieciowy Core – w tym biblioteka `onvif-zeep-async` – działa więc naprawdę.
Atrapy nie zastępują testu z rzeczywistym sprzętem.

```bash
export SZTUDIO_TEST_DATABASE_URL=postgresql+psycopg://sztudio:HASLO@127.0.0.1:5432/sztudio_test
.venv/bin/pytest
```

```bash
.venv/bin/ruff check .
```

## Struktura

```
app/
  main.py            fabryka aplikacji, start (stan uzbrojenia, konto administratora)
  config.py          konfiguracja ze zmiennych SZTUDIO_*
  models.py          modele SQLAlchemy
  schemas.py         schematy Pydantic = kontrakt API
  security.py        hasła, tokeny dostępu, szyfrowanie danych urządzeń
  auth.py            uwierzytelnianie żądań, role, ograniczanie prób logowania
  realtime.py, ws.py rozgłaszanie i kanały WebSocket
  api/               routery REST
  services/          logika domenowa: alarmy, odczyty czujników, stan kamer, zdarzenia
  monitor.py         cykliczna kontrola urządzeń, synchronizacja strumieni z go2rtc, sygnalizacja WebRTC
  integrations/
    netguard.py      polityka adresów urządzeń (SSRF)
    rtsp.py          walidacja adresów RTSP, test połączenia (OPTIONS/DESCRIBE, Digest/Basic)
    go2rtc.py        klient API go2rtc
    onvif/           WS-Discovery i odczyt urządzenia (onvif-zeep-async)
    bcs/             adapter rejestratorów: adapter.py, client.py, discovery.py, schemas.py, exceptions.py, tests/
  certs.py           lokalny urząd certyfikacji i certyfikat HTTPS
  logging_filters.py maskowanie tokenów i danych logowania w logach
  demo.py, cli.py    dane demonstracyjne (tylko development) i polecenia administracyjne
alembic/             migracje (0001 schemat, 0002 integracje sprzętowe)
tests/               testy jednostkowe i integracyjne, atrapy urządzeń
```

## Integracje

| Integracja | Moduł | Stan |
| --- | --- | --- |
| RTSP | `integrations/rtsp.py`, `monitor.py` | Działa; sprawdzone z testowym źródłem RTSP, **nie z kamerą** |
| go2rtc | `integrations/go2rtc.py`, `monitor.py` | Działa z go2rtc 1.9.15 w Compose |
| ONVIF | `integrations/onvif/` | Działa z atrapą SOAP; **nie sprawdzone z urządzeniem** |
| BCS | `integrations/bcs/` | Tylko protokoły standardowe; **brak API producenta**, nie sprawdzone – [docs/bcs.md](../docs/bcs.md) |
| MQTT (czujniki) | punkt wejścia `services.sensors.apply_reading` | Brak |
| Sieć LAN | model `NetworkDevice` | Brak wykrywania (lista ręczna) |

Migracja `0002` usuwa nieużywaną kolumnę `cameras.stream_url_encrypted` z wersji 1.0 – źródła kamer dodanych
przed aktualizacją trzeba podać ponownie w panelu.
