# Sztudio Smart Home

**Your home. Your security.**

Panel WWW (PWA) prywatnego systemu monitoringu i bezpieczeństwa domu: kamery IP, rejestrator BCS,
czujniki, alarmy, sieć lokalna i historia zdarzeń. Działa lokalnie, bez dostępu do internetu
(czcionki i ikony są wbudowane w aplikację).

Ten sam panel obsługuje desktop / Windows (instalowalne PWA, panel boczny) oraz telefony
(dolna nawigacja). Backend **Sztudio Core** jeszcze nie istnieje – panel ma gotową warstwę
komunikacji i do czasu jego powstania pracuje w **trybie demonstracyjnym**.

## Uruchomienie

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
**Ustawienia → Połączenie z Sztudio Core** (źródło danych, adres, opcjonalny token API, test połączenia).
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

Dwa ostatnie punkty (potwierdzenie alarmu, zmiana trybu uzbrojenia) nie były w pierwotnej specyfikacji –
to propozycja frontendu, do uzgodnienia przy implementacji Core.

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

## Stan realizacji (wersja 1.0.0)

| Etap | Zakres | Stan |
| --- | --- | --- |
| 1 | Fundament: Vite, React, TypeScript, Tailwind, Router, TanStack Query | gotowe |
| 2 | System wizualny, logo, nawigacja, pasek statusu | gotowe |
| 3 | Dashboard | gotowe |
| 4 | Monitoring kamer: układy 1/4/6/9, pełny ekran, wybór kamery, stronicowanie | gotowe (bez weryfikacji na sprzęcie) |
| 5 | Alarmy (uzbrojenie, potwierdzanie, historia) i czujniki | gotowe |
| 6 | Sieć LAN | gotowe |
| 7 | Historia zdarzeń (filtry: kategoria, daty) i ustawienia | gotowe, z ograniczeniami poniżej |
| 8 | PWA i responsywność | gotowe |
| 9 | Testy | 40 testów: komponenty, usługi, przepływy |

### Czego jeszcze nie ma

- **Sztudio Core** (FastAPI, PostgreSQL, MQTT, ONVIF/RTSP) – poza zakresem tego repozytorium na tym etapie.
- **Weryfikacji na rzeczywistym sprzęcie**: klient go2rtc/WebRTC i tryb „live” były sprawdzane wyłącznie
  testami z podstawionym serwerem oraz scenariuszem „serwer niedostępny”. Nie były uruchamiane z prawdziwym
  go2rtc ani rejestratorem BCS.
- **Logowania i kont użytkowników** – sekcja ustawień pokazuje tylko stan zabezpieczeń i token API.
- **Edycji integracji BCS i listy kamer z panelu** – sekcje są tylko do odczytu (dane z Core).
- **Sterowania PTZ i odtwarzania nagrań.**
- **Powiadomień w tle (push)** – powiadomienia systemowe działają, gdy panel jest otwarty.
- **Aplikacji Android (Kotlin / Jetpack Compose)** – układ mobilny jest zrealizowany jako responsywny panel WWW/PWA.
