# Sztudio Smart Home

**Your home. Your security.**

Prywatny system monitoringu i bezpieczeństwa domu: kamery IP, rejestrator BCS, czujniki, alarmy,
sieć lokalna i historia zdarzeń. Działa w sieci domowej, bez dostępu do internetu.

Repozytorium zawiera:

- **Panel WWW** (ten katalog) – React + TypeScript, instalowalne PWA dla Windows i telefonów.
- **Sztudio Core** ([`core/`](core/README.md)) – backend FastAPI + PostgreSQL: REST API, WebSocket,
  logowanie, integracje RTSP / ONVIF / go2rtc / BCS, monitor urządzeń.
- **Docker Compose** – PostgreSQL, Core, go2rtc i nginx z HTTPS.

> **Stan sprzętowy:** cała ścieżka obrazu (RTSP → go2rtc → WebRTC → przeglądarka) działa i została
> sprawdzona z **testowym źródłem RTSP**. Żaden test z rzeczywistą kamerą ani rejestratorem BCS nie
> został jeszcze wykonany – szczegóły w [docs/weryfikacja.md](docs/weryfikacja.md).

## Szybki start

Wymagany Docker z Compose. Na serwerze w sieci domowej:

```bash
./scripts/init-env.sh
```

Skrypt tworzy `.env` z losowymi hasłami, wykrywa adres IP serwera i wypisuje hasło administratora.
Jeżeli adres jest niewłaściwy (np. serwer ma kilka kart sieciowych), podaj go: `./scripts/init-env.sh 192.168.1.10`.

```bash
docker compose up -d --build
```

Compose uruchamia:

| Usługa | Rola | Dostępna z sieci LAN |
| --- | --- | --- |
| `certs` | Jednorazowo: lokalny urząd certyfikacji i certyfikat HTTPS | – |
| `db` | PostgreSQL 16 | nie |
| `core` | Sztudio Core (migracje stosowane przy starcie) | nie – tylko przez `web` |
| `go2rtc` | Strumienie wideo: RTSP → WebRTC | tylko media WebRTC (port 8555) |
| `web` | nginx: panel, `/api`, `/ws` przez HTTPS | 443 (HTTPS), 80 (przekierowanie, certyfikat CA) |

Następnie:

1. Zainstaluj certyfikat urzędu na komputerze i telefonie – [docs/https-i-certyfikaty.md](docs/https-i-certyfikaty.md).
2. Otwórz `https://ADRES-SERWERA` → **Ustawienia → Użytkownicy i bezpieczeństwo → Zaloguj**.
3. Podłącz pierwszą kamerę – [docs/pierwsza-kamera.md](docs/pierwsza-kamera.md).
4. Zainstaluj aplikację (Edge / Chrome → ikona instalacji w pasku adresu).

## Dokumentacja

| Dokument | Zawartość |
| --- | --- |
| [docs/https-i-certyfikaty.md](docs/https-i-certyfikaty.md) | HTTPS, instalacja certyfikatu na Windows i Androidzie, własny certyfikat, porty |
| [docs/pierwsza-kamera.md](docs/pierwsza-kamera.md) | Dodanie kamery (ONVIF, RTSP, przez rejestrator), kody błędów |
| [docs/bcs.md](docs/bcs.md) | Stan integracji BCS i informacje potrzebne do jej dokończenia |
| [docs/weryfikacja.md](docs/weryfikacja.md) | Co i jak zostało sprawdzone; procedura testu ze sprzętem |
| [core/README.md](core/README.md) | Backend: konfiguracja, kontrakt API, bezpieczeństwo, testy |

## Panel WWW – praca deweloperska

Wymagany Node.js 20+.

```bash
npm install
npm run dev        # serwer deweloperski
npm run build      # kontrola typów + wersja produkcyjna w dist/
npm run preview    # podgląd wersji produkcyjnej (z Service Workerem)
npm test           # testy (Vitest + Testing Library)
```

Serwer deweloperski działa w trybie demonstracyjnym albo łączy się z Core wskazanym w
**Ustawienia → Połączenie z Sztudio Core** (Core musi wtedy mieć `SZTUDIO_CORS_ORIGINS` z adresem panelu).
Wartości domyślne przy budowaniu: `VITE_CORE_URL`, `VITE_DEFAULT_MODE` (`demo` | `live`).

### Obraz z kamer

Panel nie łączy się z go2rtc ani z kamerami i nie zna adresów RTSP. Kafel kamery wysyła ofertę WebRTC do
Core (`POST /api/v1/cameras/{id}/webrtc`, wymaga zalogowania), Core wymienia ją z go2rtc w sieci wewnętrznej,
a obraz płynie szyfrowanym połączeniem WebRTC. Po utracie połączenia kafel wznawia je sam
(odstępy 2, 5, 10, 20, 30 s). W trybie demonstracyjnym obraz **nie jest symulowany**.

## Architektura panelu

```
src/
  app/          router, dostawcy, granica błędów, rejestracja PWA
  layouts/      układ: panel boczny, pasek statusu, dolna nawigacja, powiadomienia
  pages/        ekrany (po jednym na trasę)
  modules/      logika domenowa: dashboard, cameras, recorders, alarms, sensors, network, events, settings
  components/   komponenty wielokrotnego użytku (karty, okna, statusy, pola, stany ładowania/błędu/pustki)
  services/
    api/        klient HTTP, ścieżki, interfejs SztudioCoreApi
    mock/       dane demonstracyjne (oddzielone od usług rzeczywistych)
    realtime/   klient WebSocket z ponawianiem
    go2rtc/     sesja WebRTC sygnalizowana przez Core
  hooks/        zapytania i akcje (TanStack Query), stan połączenia, zegar, pełny ekran, powiadomienia
  stores/       ustawienia (localStorage), komunikaty, stan WebSocket, instalacja PWA
  types/        typy danych API
```

Ekrany: Start, Kamery, Alarmy, Czujniki, Rejestratory, Sieć, Historia, Diagnostyka, Ustawienia.

## Stan realizacji

### Etap 1 – panel WWW

Dashboard, monitoring kamer (układy 1/4/6/9, pełny ekran), alarmy, czujniki, sieć, historia zdarzeń,
ustawienia, PWA, układ mobilny, tryb demonstracyjny.

### Etap 2 – Sztudio Core

REST API zgodne z typami panelu, WebSocket, logowanie administratora, role, tokeny API, potwierdzanie
alarmów, tryb uzbrojenia, reguły alarmów, migracje Alembic, Docker Compose.

### Etap 3 – integracje sprzętowe

- **HTTPS**: lokalny urząd certyfikacji, nginx z TLS 1.2/1.3, WSS, nagłówki bezpieczeństwa, brak tokenów w logach.
- **go2rtc** w Compose: strumienie rejestrowane przez Core (bez plików z hasłami na dysku), API niepublikowane,
  automatyczna ponowna rejestracja po restarcie go2rtc.
- **RTSP**: dodawanie, edycja, usuwanie kamer, test połączenia (Digest/Basic), profile strumienia,
  szyfrowane hasła, ochrona przed SSRF, status online/offline z monitora, alarmy utraty połączenia.
- **ONVIF**: wykrywanie (WS-Discovery: skan podsieci i multicast), producent, model, profile mediów,
  adresy strumieni, test logowania, dodanie wykrytej kamery.
- **BCS**: moduł `core/app/integrations/bcs/` oparty na protokołach standardowych – rejestracja, test
  protokołów, kanały przez ONVIF lub szablon, import kanałów jako kamer. Bez API producenta – zob. [docs/bcs.md](docs/bcs.md).
- **Diagnostyka**: ostatnia próba i udane połączenie, kod i opis błędu, czas odpowiedzi, stan strumienia,
  stan go2rtc i monitora; ekran Diagnostyka.
- **Panel**: zarządzanie kamerami i rejestratorami, wyszukiwanie ONVIF, rzeczywisty podgląd WebRTC
  z automatycznym wznawianiem, informacja o źródle obrazu i błędach.

### Czego jeszcze nie ma

- **Testów z rzeczywistym sprzętem** – kamera IP, rejestrator BCS, WS-Discovery multicast w sieci domowej.
- **Funkcji rejestratora wymagających API producenta**: zdarzenia, nagrania, stan dysków, PTZ – zob. [docs/bcs.md](docs/bcs.md).
- **Kamer H.265 (HEVC)** – przeglądarki nie odtwarzają ich przez WebRTC; potrzebny strumień H.264
  albo transkodowanie (go2rtc + ffmpeg, niezaimplementowane).
- **MQTT** (czujniki), **wykrywania urządzeń sieciowych i pomiaru opóźnień** (lista sieci jest ręczna).
- **Zarządzania użytkownikami w panelu** – konto administratora z CLI, tokeny API przez API.
- **Powiadomień push w tle**, **aplikacji Android (Kotlin)** – mobilnie działa responsywne PWA.
