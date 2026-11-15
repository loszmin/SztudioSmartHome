# Sztudio Smart Home

**Your home. Your security.**

Panel WWW (PWA) prywatnego systemu monitoringu i bezpieczeństwa domu: kamery IP, rejestrator BCS,
czujniki, alarmy, sieć lokalna i historia zdarzeń. Działa lokalnie, bez dostępu do internetu
(czcionki i ikony są wbudowane w aplikację).

Repozytorium zawiera dwie części:

- **Panel WWW** (ten katalog) – React + TypeScript, instalowalne PWA dla desktopu / Windows i telefonów.
- **Sztudio Core** ([`core/`](core/README.md)) – backend FastAPI + PostgreSQL: REST API, WebSocket, logowanie.

Integracje sprzętowe (BCS, RTSP, ONVIF, go2rtc, MQTT) **nie są jeszcze zaimplementowane** – zob. „Stan realizacji”.

## Szybki start (Docker Compose)

```bash
cp .env.example .env
```

Uzupełnij w `.env`: `POSTGRES_PASSWORD`, `SZTUDIO_SECRET_KEY` (min. 32 znaki) i `SZTUDIO_ADMIN_PASSWORD`, a następnie:

```bash
docker compose up -d --build
```

Panel: `http://<adres-hosta>:8080` → **Ustawienia → Użytkownicy i bezpieczeństwo → Zaloguj**
(login z `SZTUDIO_ADMIN_USERNAME`). Compose uruchamia PostgreSQL, Core (migracje stosowane przy starcie)
i nginx z panelem, który pośredniczy w ruchu `/api` i `/ws`. Baza i Core nie są wystawiane na hoście.

Świeża instalacja jest pusta – kamery, rejestratory i czujniki dodaje się przez API administratora
(zob. [`core/README.md`](core/README.md)), dopóki nie powstaną integracje sprzętowe.

## Panel WWW – praca deweloperska

Wymagany Node.js 20+.

```bash
npm install
npm run dev        # serwer deweloperski
npm run build      # kontrola typów + wersja produkcyjna w dist/
npm run preview    # podgląd wersji produkcyjnej (z Service Workerem)
npm test           # testy (Vitest + Testing Library)
```

## Połączenie z Sztudio Core

Adres serwera nie jest zapisany w kodzie. Ustawia się go w aplikacji:
**Ustawienia → Połączenie z Sztudio Core** (źródło danych, adres, test połączenia), a loguje w sekcji
**Użytkownicy i bezpieczeństwo** (login i hasło → token dostępu; alternatywnie ręcznie wklejony token API).
Puste pole adresu oznacza „ten sam adres, z którego otwarto panel” – wygodne, gdy Core sam serwuje `dist/`.

Wartości domyślne przy pierwszym uruchomieniu można podać przy budowaniu (`.env`, zob. `.env.example`):
`VITE_CORE_URL`, `VITE_GO2RTC_URL`, `VITE_DEFAULT_MODE` (`demo` | `live`).

### Kontrakt API (v1)

JSON w camelCase, daty ISO 8601. Typy: [`src/types/api.ts`](src/types/api.ts), ścieżki: [`src/services/api/endpoints.ts`](src/services/api/endpoints.ts).

| Metoda | Ścieżka | Odpowiedź |
| --- | --- | --- |
| GET | `/api/v1/system/status` | `SystemStatus` (stan Core, zasoby, usługi, tryb uzbrojenia) |
| GET | `/api/v1/devices` | `Device[]` |
| GET | `/api/v1/cameras` | `Camera[]` |
| GET | `/api/v1/alarms` | `Alarm[]` |
| GET | `/api/v1/sensors` | `Sensor[]` |
| GET | `/api/v1/events?category=&from=&to=&limit=` | `SystemEvent[]` |
| GET | `/api/v1/network/devices` | `NetworkDevice[]` |
| POST | `/api/v1/alarms/{id}/acknowledge` | `Alarm` |
| PUT | `/api/v1/alarms/arming` `{ "mode": "disarmed" \| "armed_home" \| "armed_away" }` | `AlarmSystemState` |

Wszystkie punkty wymagają nagłówka `Authorization: Bearer <token>`; token wydaje `POST /api/v1/auth/login`.
Pełny kontrakt (w tym API administracyjne) opisuje [`core/README.md`](core/README.md).

WebSocket: `/ws/v1/events`, `/ws/v1/system`, `/ws/v1/cameras`, `/ws/v1/alarms`. Panel oczekuje komunikatów
JSON z polem `type`; każdy komunikat powoduje odświeżenie powiązanych danych przez REST. Połączenia są
wznawiane automatycznie. Token (jeśli ustawiony) jest przekazywany jako `?token=`.

### Obraz z kamer (go2rtc)

Kafel kamery zestawia sesję WebRTC: `POST {go2rtc}/api/webrtc?src={camera.streamName}` (oferta SDP → odpowiedź SDP).
Adres go2rtc: **Ustawienia → Konfiguracja kamer**; domyślnie `{adres Core}/go2rtc`.
W trybie demonstracyjnym obraz **nie jest symulowany** – kafle pokazują czytelny stan zastępczy.

## Architektura

```
src/
  app/          router, dostawcy, granica błędów, rejestracja PWA
  layouts/      układ aplikacji: panel boczny, pasek statusu, dolna nawigacja, powiadomienia
  pages/        ekrany (po jednym na trasę)
  modules/      komponenty i logika domenowa: dashboard, cameras, alarms, sensors, network, events, settings
  components/   komponenty wielokrotnego użytku (karty, statusy, przyciski, pola, stany ładowania/błędu/pustki)
  services/
    api/        klient HTTP, ścieżki, interfejs SztudioCoreApi
    mock/       dane demonstracyjne (ta sama implementacja interfejsu, oddzielona od usług rzeczywistych)
    realtime/   klient WebSocket z ponawianiem
    go2rtc/     klient WebRTC
  hooks/        zapytania TanStack Query, stan połączenia, zegar, pełny ekran, powiadomienia
  stores/       ustawienia (localStorage), komunikaty, stan WebSocket, instalacja PWA
  types/        typy danych API
  styles/       motyw (kolory Sztudio) i style bazowe
```

Ekrany: Start (`/`), Kamery (`/kamery`), Alarmy (`/alarmy`), Czujniki (`/czujniki`), Sieć (`/siec`),
Historia (`/historia`), Ustawienia (`/ustawienia`).

## PWA

`npm run build` generuje manifest i Service Workera (precache całej aplikacji). Dane z `/api`, `/ws`
i `/go2rtc` nigdy nie są serwowane z cache – przy braku serwera panel pokazuje stan „Brak połączenia”
zamiast nieaktualnych danych.

**Ważne:** przeglądarki rejestrują Service Workera i pozwalają instalować PWA tylko w bezpiecznym
kontekście – `https://` lub `http://localhost`. Panel otwarty jako `http://192.168.x.x` działa normalnie,
ale bez instalacji i pracy offline. Docelowo Core powinien udostępniać panel przez HTTPS (np. certyfikat lokalny).

## Stan realizacji

### Etap 1 – panel WWW (1.0.0)

Dashboard, monitoring kamer (układy 1/4/6/9, pełny ekran), alarmy, czujniki, sieć, historia zdarzeń,
ustawienia, PWA, układ mobilny, tryb demonstracyjny. 42 testy (Vitest).

### Etap 2 – Sztudio Core (1.0.0)

REST API zgodne z typami panelu, WebSocket (4 kanały), logowanie administratora, role, tokeny API,
potwierdzanie alarmów, tryb uzbrojenia, reguły alarmów dla odczytów czujników, migracje Alembic,
Docker Compose. 48 testów (pytest, PostgreSQL). Szczegóły: [`core/README.md`](core/README.md).

### Czego jeszcze nie ma

- **Integracji sprzętowych**: BCS Point / BCS Line, RTSP, ONVIF, go2rtc, MQTT. Core ma dla nich modele
  i punkty wejścia, ale żaden kod nie łączy się z urządzeniami – statusy kamer, rejestratorów i czujników
  zmieniają się tylko przez API. `/system/status` raportuje te integracje jako zatrzymane.
- **Obrazu z kamer**: wymaga go2rtc i konfiguracji strumieni. Klient WebRTC w panelu nie był uruchamiany
  z prawdziwym go2rtc; bez niego kafel kamery pokazuje „Brak obrazu”.
- **Wykrywania urządzeń w sieci** (skanowanie LAN, pomiar opóźnień) – lista sieci jest prowadzona ręcznie przez API.
- **Ekranów administracyjnych w panelu**: dodawanie kamer, rejestratorów, czujników, użytkowników i tokenów
  odbywa się przez API / CLI. Sekcje „Integracja BCS” i „Konfiguracja kamer” są tylko do odczytu.
- **Zarządzania wieloma użytkownikami przez API** – istnieje konto administratora (CLI) i tokeny API z rolą.
- **HTTPS** – Compose wystawia panel po HTTP; instalacja PWA wymaga HTTPS lub `localhost` (zob. „PWA”).
- **Powiadomień w tle (push)**, **PTZ**, **odtwarzania nagrań**.
- **Aplikacji Android (Kotlin / Jetpack Compose)** – układ mobilny działa jako responsywny panel WWW/PWA.
