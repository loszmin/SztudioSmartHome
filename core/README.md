# Sztudio Core

Backend systemu Sztudio Smart Home: REST API, WebSocket i uwierzytelnianie dla panelu WWW.
Python 3.12, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL.

> **Integracje sprzętowe nie są zaimplementowane.** Core nie łączy się z rejestratorami BCS, kamerami
> (RTSP / ONVIF), go2rtc ani MQTT. Przechowuje konfigurację urządzeń i udostępnia punkty wejścia,
> przez które przyszłe integracje będą zgłaszać stan. Żadna część tego kodu nie była testowana
> z rzeczywistym urządzeniem.

## Uruchomienie

### Docker Compose (zalecane)

Z katalogu głównego repozytorium – zob. [README](../README.md#szybki-start-docker-compose).
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

Hasło jest wczytywane z klawiatury albo ze zmiennej `SZTUDIO_ADMIN_PASSWORD` (min. 10 znaków), nigdy z argumentów.
`seed-demo` ładuje dane przykładowe **tylko** przy `SZTUDIO_ENVIRONMENT=development` i tylko do pustej bazy –
w trybie produkcyjnym odmawia. W Compose: `docker compose exec core python -m app.cli …`.

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
| GET | `/cameras` | | `Camera[]` |
| POST / PATCH / DELETE | `/cameras`, `/cameras/{id}` | A | Konfiguracja kamery; `PATCH` przyjmuje też `status` i `signalQuality` |
| GET | `/recorders`, `/recorders/{id}` | | Rejestratory (bez hasła – tylko `hasPassword`) |
| POST / PATCH / DELETE | `/recorders`, `/recorders/{id}` | A | Konfiguracja rejestratora (`series`: `bcs_point` / `bcs_line` / `other`) |
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

Jeden aktywny alarm na czujnik. Przejście kamery w `offline` tworzy zdarzenie i alarm krytyczny; powrót `online` zamyka alarm.
O tym, czy temperatura jest „poza zakresem”, decyduje zgłaszający odczyt – Core nie ma jeszcze konfiguracji progów.

### WebSocket

`/ws/v1/events`, `/ws/v1/system`, `/ws/v1/cameras`, `/ws/v1/alarms` – token w parametrze `?token=`
(przeglądarki nie pozwalają ustawić nagłówka). Nieprawidłowy token zamyka połączenie kodem `4401`.
Komunikaty: `{"type": "...", "data": {...}, "timestamp": "..."}`, wysyłane po zatwierdzeniu transakcji.

| Kanał | Typy komunikatów |
| --- | --- |
| `events` | `event.created` |
| `alarms` | `alarm.created`, `alarm.updated`, `arming.changed`, `sensor.created` / `updated` / `deleted` |
| `cameras` | `camera.created` / `updated` / `deleted` |
| `system` | `recorder.*`, `network.*` |

Po połączeniu serwer wysyła `connected`. Rejestr połączeń jest w pamięci procesu, dlatego Core działa jako **jeden worker**.

## Bezpieczeństwo

- Hasła użytkowników: Argon2id. Tokeny API: w bazie tylko skrót SHA-256.
- Hasła rejestratorów i adresy źródłowe strumieni (RTSP z danymi logowania) są szyfrowane (Fernet, klucz
  wyprowadzony z `SZTUDIO_SECRET_KEY`) i **nigdy nie są zwracane przez API**. Klient dostaje tylko nazwę strumienia go2rtc.
  Utrata lub zmiana `SZTUDIO_SECRET_KEY` oznacza konieczność ponownego wpisania haseł urządzeń.
- Tokeny w adresach WebSocket są maskowane w dzienniku serwera (`token=***`).
- Dokumentacja `/api/docs` jest wyłączona w trybie produkcyjnym.
- Ruch nie jest szyfrowany przez samego Core – HTTPS należy zapewnić na serwerze pośredniczącym.
  Do tego czasu token i hasło logowania są przesyłane w sieci lokalnej otwartym tekstem.

## Testy

Testy integracyjne działają na prawdziwym PostgreSQL; schemat budują migracje Alembic.
**Wskazana baza jest czyszczona** – użyj osobnej.

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
  demo.py, cli.py    dane demonstracyjne (tylko development) i polecenia administracyjne
alembic/             migracje
tests/               testy jednostkowe i integracyjne
```

## Miejsca na integracje

Integracja powinna wywoływać funkcje z `app/services/` (te same, których używa API):

| Integracja | Punkt wejścia | Stan |
| --- | --- | --- |
| MQTT (czujniki) | `services.sensors.apply_reading` | brak |
| BCS Point / BCS Line | model `Recorder` (`series`, dane logowania), `services.cameras.set_camera_status` | brak |
| RTSP / ONVIF | `Camera.stream_url_encrypted`, `Camera.source` | brak |
| go2rtc | `Camera.stream_name`; brak generowania konfiguracji i pośredniczenia `/go2rtc` | brak |
| Sieć LAN | model `NetworkDevice` | brak (lista ręczna) |
