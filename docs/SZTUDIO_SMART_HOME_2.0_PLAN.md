# Sztudio Smart Home 2.0 – audyt i plan modernizacji

Data audytu: 2026-11-16. Gałąź robocza: `feature/sztudio-smart-home-2.0` (utworzona z `ebc3c96`,
ostatniego commitu wersji 1.0 na `claude/stoic-pasteur-emqyh1`). W repozytorium zdalnym nie ma gałęzi `main`.

Środowisko docelowe: NAS UGREEN DXP2800 (UGOS / Debian), `192.168.1.11`, Docker Compose, PostgreSQL 16,
panel `https://192.168.1.11:8443`.

> **Ważne:** autor audytu **nie ma dostępu do NAS-a**. Fakty o produkcji poniżej pochodzą od użytkownika
> (stan na 2026-11-17); konfiguracji `compose.nas.yml` i `.env` autor nie widział.

### Potwierdzone fakty o produkcji (od użytkownika, 2026-11-17)

| Element | Stan |
| --- | --- |
| Repozytorium | `/volume1/Sztudio Smart Home/repository` – **bez Gita** (Git nie jest zainstalowany na NAS-ie) |
| Dane PostgreSQL | `/volume1/Sztudio Smart Home/postgres` (bind mount – nie wolumin `db-data` z repozytorium) |
| Kopie | `/volume1/Sztudio Smart Home/backups` |
| Użytkownik SSH | `loszmin` (pliki `.env` / `certs/` należą do roota → `sudo`) |
| Usługi | `certs`, `db`, `core`, `go2rtc`, `web`; obraz bazy `postgres:16-alpine`; schemat Alembic `0002` |
| Docker Compose | v5.1.3 |
| Kopia przed 2.0 | **wykonana przez użytkownika**: `pg_dump -Fc`, `pg_restore -l`, `pg_restore --schema-only`, pełne odtworzenie w izolowanym kontenerze (10 tabel, `0002`), kopia konfiguracji i certyfikatów; usługi produkcyjne działają |

## 1. Stan wyjściowy – wyniki testów przed zmianami

| Zestaw | Polecenie | Wynik (2026-11-16, przed zmianami 2.0) |
| --- | --- | --- |
| Backend (pytest, PostgreSQL 16) | `cd core && .venv/bin/pytest` | 133 / 133 |
| Panel WWW (Vitest) | `npx vitest run` | 65 / 65 |
| Android (JVM, Robolectric) | `./gradlew testDebugUnitTest` | 54 / 54 |
| Android przeciw prawdziwemu Core | `./gradlew testDebugUnitTest -PrealCore` | 7 / 7 przy wersji 1.0 (wymaga stosu Docker) |
| Testy ze sprzętem (kamera, BCS, telefon) | – | **nigdy nie wykonano** |

Stan etapów: **Etap 0 + poprawki 0.1 – zrealizowane i sprawdzone w symulacji NAS-a (Compose v5.1.3, bind mount
bazy w ścieżce ze spacjami, bez Gita), niewdrożone na NAS** (szczegóły i wyniki:
[SZTUDIO_SMART_HOME_2.0_CHANGELOG.md](SZTUDIO_SMART_HOME_2.0_CHANGELOG.md)). Etapy I–VII – nierozpoczęte.

## 2. Stan modułów

### 2.1 Sztudio Core (`core/`)

| Obszar | Stan | Uwagi |
| --- | --- | --- |
| Framework | FastAPI, SQLAlchemy 2, Alembic (2 migracje), Pydantic 2, psycopg 3 | Jeden proces uvicorn (wymóg huba WebSocket w pamięci) |
| Uwierzytelnianie | Logowanie (Argon2), JWT 7 dni z `token_version`, tokeny API (SHA-256, rola), zmiana hasła | Brak odświeżania tokenów i wylogowania po stronie serwera; brak zarządzania użytkownikami przez API (konto admin z CLI / `.env`) |
| Ochrona logowania | `LoginThrottle` w pamięci | Licznik zeruje się przy restarcie; brak dziennika audytu logowań |
| Kamery | CRUD, test RTSP (Digest/Basic), profile, hasła szyfrowane (Fernet), SSRF guard | Jeden strumień na kamerę (brak main/sub), brak PTZ, brak nagrań, brak H.265 |
| Rejestratory / BCS | Rejestracja, test protokołów, kanały przez ONVIF lub szablon | `hardware_verified=False`; funkcje producenta niedostępne bez dokumentacji |
| ONVIF | WS-Discovery (multicast + skan), profile, test logowania | Nietestowane w prawdziwej sieci |
| go2rtc | Rejestracja strumieni przez API, ponowna rejestracja po restarcie | Strumień kopiowany bez transkodowania (dobrze) |
| Monitor urządzeń | Cykl 30 s, próg 2 błędów, alarmy utraty połączenia | – |
| Alarmy | Tryb uzbrojenia, potwierdzanie, alarm z odczytu czujnika | Reguły **zapisane w kodzie** (`services/sensors.py: alarm_severity_for`), bez konfiguracji |
| Czujniki | CRUD, odczyty przez REST | Brak MQTT i jakiegokolwiek źródła odczytów poza API |
| Zdarzenia | Zapis, filtry, WebSocket | **Brak retencji** – tabele `events` i `alarms` rosną bez ograniczeń |
| Status systemu | CPU, RAM, dysk | `disk_usage("/")` mierzy system plików kontenera, nie wolumin NAS-a |
| Health | `GET /api/v1/health` zwraca `ok` bez sprawdzenia bazy | Healthcheck kontenera nie wykryje utraty połączenia z bazą |
| Certyfikaty | Lokalny CA (EC P-256, 10 lat), certyfikat serwera 820 dni z odnowieniem 30 dni przed końcem | CA nie jest regenerowany, gdy istnieje |

### 2.2 Panel WWW (`src/`)

React 19 + Vite 8 + Tailwind 4 + TanStack Query, PWA (`registerType: prompt`, API wyłączone z cache
Service Workera). Ekrany: Start, Kamery (1/4/6/9, WebRTC), Alarmy, Czujniki, Rejestratory, Sieć, Historia,
Diagnostyka, Ustawienia. Tryb demonstracyjny oddzielony od trybu rzeczywistego.

Braki: zarządzanie użytkownikami, automatyzacje, urządzenia smart home, harmonogramy, informacja o wersji
serwera i dostępnej aktualizacji, ekran kopii zapasowych. Cache API: `staleTime` 5 s + odświeżanie cykliczne
+ WebSocket – nie znaleziono trwałego cache odpowiedzi API (wymaganie „brak starego cache API” jest spełnione
dla Service Workera; do sprawdzenia nagłówki `Cache-Control` odpowiedzi `/api/`).

### 2.3 Aplikacja Android (`android/`)

Kotlin 2.3, Compose, MVVM, ręczne DI, Retrofit/OkHttp, WebRTC SDK, sesja w Keystore, zaufanie do lokalnego CA
przez Network Security Config (bez obejść TLS). Funkcje: monitoring, alarmy, czujniki, historia, diagnostyka.

Braki: **nigdy nie uruchomiona na telefonie**, brak konfiguracji podpisu release, brak powiadomień
(Core ich nie wysyła), brak zarządzania urządzeniami, brak testów instrumentacyjnych.

### 2.4 Infrastruktura (`docker-compose.yml`, `docker/`, `scripts/`)

| Element | Stan | Ryzyko |
| --- | --- | --- |
| Sieci | Wspólna sieć `internal`; `db`, `core`, API go2rtc niepublikowane | OK – wymaganie „bez wystawiania do internetu” spełnione na poziomie Compose; przekierowanie portów na routerze musi pozostać wyłączone |
| Publikowane porty | `web` 443/80 (na NAS-ie 8443), `go2rtc` 8555 TCP/UDP | Port 80 serwuje tylko przekierowanie i publiczny certyfikat CA |
| Kopie zapasowe | **Brak** skryptów i dokumentacji | **Krytyczne** – brak procedury odtworzenia |
| Logi kontenerów | Domyślny sterownik `json-file` **bez limitu** | Zapełnienie dysku systemowego NAS-a |
| Healthchecki | `db`, `core` (w Dockerfile) | Brak dla `web` i `go2rtc` |
| Uprawnienia | `core` jako użytkownik nieuprzywilejowany; nginx, go2rtc jako root | Brak `no-new-privileges` |
| Obrazy | `postgres:16-alpine`, `nginx:1.27-alpine` (tagi ruchome w obrębie wersji), `sztudio-core:local`, obraz `web` bez nazwy | Brak możliwości szybkiego wycofania (obraz nadpisywany przy budowaniu) |
| Wolumin bazy | Repozytorium: nazwany wolumin `db-data`. NAS: dane w `/volume1/Sztudio Smart Home/postgres` | **Rozbieżność** – produkcja ma najpewniej lokalną modyfikację Compose. Zmiana definicji woluminu mogłaby „odpiąć” dane |
| Aktualizacje | Brak procedury i wycofania | – |
| Diagnostyka | Ekran Diagnostyka w panelu | Brak raportu z poziomu hosta (kontenery, certyfikaty, miejsce, wersje) |

## 3. Błędy i ryzyka (priorytet)

| # | Ryzyko | Priorytet | Etap |
| --- | --- | --- | --- |
| R1 | Brak kopii zapasowych i procedury odtworzenia bazy, CA i `.env` | Krytyczny | 0 |
| R2 | Nieograniczone logi Dockera na dysku NAS-a | Wysoki | 0 |
| R3 | Brak możliwości wycofania aktualizacji (obraz `:local` nadpisywany, migracje bez kopii) | Wysoki | 0 |
| R4 | Rozbieżność konfiguracji produkcji z repozytorium (wolumin bazy, port) | Wysoki | 0 – tylko dokumentacja, bez zmian |
| R5 | Health Core nie sprawdza bazy | Średni | I |
| R6 | Brak retencji `events` / `alarms` | Średni | I |
| R7 | Pomiar dysku w kontenerze, nie na woluminie danych | Średni | I |
| R8 | Brak zarządzania użytkownikami (tylko CLI), brak dziennika audytu | Średni | I |
| R9 | Throttle logowania w pamięci (reset przy restarcie) | Niski | I |
| R10 | Aplikacja Android i WebRTC niezweryfikowane na urządzeniu | Średni | IV – wymaga użytkownika |
| R11 | Integracje sprzętowe niezweryfikowane (kamera, BCS, ONVIF multicast) | Średni | II – wymaga użytkownika |
| R12 | nginx i go2rtc jako root w kontenerach | Niski | VI |
| R13 | nginx rozwiązywał `core` tylko przy starcie → 502 po zmianie IP Core (wykryte w Etapie 0) | Wysoki | 0 – naprawione |
| R14 | Skrypty Etapu 0 wymagały Gita (brak na NAS-ie) – `backup.sh` nie działał, `update.sh` całkowicie oparty na Gicie | Krytyczny | 0.1 – naprawione |
| R15 | Skrypty wywoływały `docker compose` bez `compose.nas.yml` → `up -d` w aktualizacji mógł uruchomić bazę na pustym `db-data` | Krytyczny | 0.1 – naprawione (pliki z etykiet stosu + strażnik montowania) |
| R16 | Kopia konfiguracji bez `compose.nas.yml`, nginx, go2rtc; pliki root-owned po cichu pomijane przy braku sudo | Wysoki | 0.1 – naprawione |
| R17 | `restore.sh`: zamiana nazw baz poza transakcją, brak restartu usług po błędzie | Wysoki | 0.1 – naprawione i sprawdzone wymuszonym błędem |

## 4. Proponowane zmiany wg etapów

Kolejność została zmieniona względem zlecenia o **Etap 0 – bezpieczeństwo danych** przed Etapem I:
żadna zmiana schematu bazy (Etap I+) nie powinna trafić na NAS bez sprawdzonej kopii i procedury wycofania.

### Etap 0 – bezpieczeństwo danych i operacje (bez zmian kodu aplikacji i schematu)

- `scripts/backup.sh` – pełna kopia: zrzut bazy `pg_dump -Fc` przez `docker compose exec`, weryfikacja zrzutu,
  archiwum konfiguracji (`.env*`, wszystkie pliki Compose z `compose.nas.yml`, nginx, go2rtc, `certs/` z kluczami –
  bez wyświetlania), suma każdego pliku konfiguracji, retencja, uprawnienia `700/600`, ścieżki ze spacjami, bez Gita.
- `scripts/verify-backup.sh` – nieniszcząca próba odtworzenia zrzutu w **tymczasowym, odizolowanym kontenerze**
  PostgreSQL (bez sieci), raport liczby wierszy w tabelach. Produkcyjna baza nie jest dotykana.
- Usługa `backup` w Compose (profil `backup`, opcjonalna) – automatyczny zrzut bazy co N godzin z retencją.
- `scripts/diagnostics.sh` – raport bez sekretów: wersje, stan kontenerów i healthchecków, porty, ważność
  certyfikatów publicznych, miejsce na dysku, ostatnie kopie, ostatnie linie logów z maskowaniem.
- `scripts/update.sh` – aktualizacja **z archiwum wydania, bez Gita** (0.1), z kopią przed zmianą, danymi do
  wycofania, strażnikiem danych bazy i oczekiwaniem na healthchecki; `scripts/rollback.sh` – wycofanie.
- Compose: rotacja logów, healthchecki `web` i `go2rtc`, `no-new-privileges` (bez `db`), nazwa obrazu
  `sztudio-web:local`. **Definicja woluminu bazy bez zmian** (produkcja nadpisuje ją w `compose.nas.yml`).
- Testy konfiguracji Compose (brak publikacji `db`/`core`/API go2rtc, limity logów, healthchecki) i skryptów.
- Dokumentacja: `docs/kopie-zapasowe.md`, `docs/aktualizacja-i-wycofanie.md`.

### Etap I – Core 2.0

- `GET /api/v1/health` z kontrolą bazy (`/health/live` bez bazy dla healthchecka, `/health/ready` z bazą).
- Retencja zdarzeń i rozwiązanych alarmów (konfigurowalna, domyślnie 365 dni, bez usuwania aktywnych alarmów;
  zadanie okresowe; najpierw tryb raportu).
- Zarządzanie użytkownikami: `GET/POST/PATCH /api/v1/users`, role `admin` / `viewer`, blokada usunięcia
  ostatniego administratora, wylogowanie wszystkich sesji (`token_version`).
- Dziennik audytu (logowania, zmiany konfiguracji) – nowa tabela, migracja **addytywna** 0003.
- Pomiar miejsca na woluminie danych (ścieżka konfigurowalna, montowana tylko do odczytu).
- Wersja i informacja o kompilacji w `/system/status` (commit, data), na potrzeby aktualizacji w panelu.

### Etap II – Monitoring PRO

- Profile main/sub: drugi strumień kamery (sub dla siatki, main dla pełnego ekranu) – go2rtc bez transkodowania.
- PTZ przez ONVIF **tylko gdy kamera deklaruje usługę PTZ** (`GetServiceCapabilities`), inaczej ukryte.
- Nagrania: **tylko po potwierdzeniu** dostępności (ONVIF Profile G / rejestrator) – bez tego funkcja nie powstaje.
- Migawki z go2rtc (`/api/frame.jpeg`) przez Core.
- Wymaga testów z kamerą użytkownika (R11).

### Etap III – Smart Home

- Broker MQTT lokalnie (Mosquitto w Compose, tylko sieć LAN, uwierzytelnianie, bez internetu).
- Model urządzeń (czujniki, przełączniki, przekaźniki) zasilany z MQTT; obecne czujniki pozostają.
- Silnik reguł: wyzwalacz (zdarzenie, odczyt, zmiana trybu, harmonogram) → warunki → akcje (alarm, zdarzenie,
  komunikat MQTT, zmiana trybu, powiadomienie). Obecna logika `alarm_severity_for` jako reguły domyślne
  (migracja danych bez zmiany zachowania).
- Harmonogramy (np. automatyczne uzbrojenie), scenariusze alarmowe.
- Powiadomienia lokalne: WebSocket + Web Push (VAPID, bez chmury dostawcy usług poza przeglądarką)
  oraz opcjonalnie ntfy/e-mail na serwerze użytkownika. Bez obowiązkowej chmury.

### Etap IV – Android 2.0

- Konfiguracja podpisu release z `keystore.properties` poza repozytorium; APK debug i release.
- Powiadomienia: usługa pierwszoplanowa z WebSocket (bez FCM) – opcjonalna, z informacją o zużyciu baterii.
- Zarządzanie urządzeniami i automatyzacjami (po Etapie III), PTZ (po Etapie II).
- Aktualizacja zależności (AGP 9 / compileSdk 37) po teście na urządzeniu.

### Etap V – Panel WWW 2.0

- Ekrany: Użytkownicy, Urządzenia, Automatyzacje, System (wersja, kopie zapasowe, aktualizacja – informacja
  i instrukcja; panel nie wykonuje poleceń na hoście).
- Weryfikacja nagłówków cache dla `/api/` (`Cache-Control: no-store`).

### Etap VI – Audyt bezpieczeństwa i infrastruktury

- Przegląd nginx (TLS, nagłówki, limity), go2rtc (bind, uwierzytelnianie), Postgres (uprawnienia, wersja),
  uprawnień plików na NAS-ie, sekretów, uruchamianie nginx/go2rtc bez roota, przypięcie obrazów do skrótów.
- Część elementów (backupy, healthchecki, logi) realizowana już w Etapie 0.

### Etap VII – Testy i raport jakości

- Pełny przebieg testów, testy end-to-end w Docker, raport `docs/SZTUDIO_SMART_HOME_2.0_TEST_REPORT.md`
  z wyraźnym podziałem: zweryfikowane / zweryfikowane tylko atrapami / niezweryfikowane.

## 5. Zależności między modułami

```
Etap 0 (backup, rollback) ──► warunek wdrożenia każdego kolejnego etapu na NAS
Etap I (health, users, audyt, retencja) ──► Etap V (ekrany Użytkownicy/System), Etap IV
Etap II (main/sub, PTZ) ──► panel (Etap V) i Android (Etap IV): sterowanie PTZ, wybór strumienia
Etap III (MQTT, urządzenia, reguły, powiadomienia) ──► Etap V (Urządzenia, Automatyzacje), Etap IV (powiadomienia)
Etap VI ──► przegląd końcowy wszystkich zmian; Etap VII ──► raport
```

Kontrakt API jest wspólny dla panelu i Androida – każda zmiana API w Core wymaga aktualizacji typów
w `src/types/api.ts`, DTO Androida i `docs/ANDROID_API_MAPPING.md`. Zmiany API są **wyłącznie addytywne**
(istniejące pola i trasy pozostają), żeby stare wersje aplikacji działały z nowym Core.

## 6. Plan migracji danych

- Wyłącznie migracje Alembic **addytywne** (nowe tabele, nowe kolumny z wartością domyślną lub `NULL`).
  Bez `DROP` danych użytkowników i urządzeń.
- Każda migracja ma test `upgrade → downgrade → upgrade` na pustej bazie i test na bazie z danymi
  (fixture z kamerami, czujnikami, alarmami).
- Przed migracją na NAS-ie: `scripts/backup.sh` + `scripts/verify-backup.sh` (warunek konieczny).
- Wycofanie wersji po migracji: odtworzenie zrzutu sprzed aktualizacji (procedura w
  `docs/aktualizacja-i-wycofanie.md`); `alembic downgrade` tylko jako opcja dodatkowa.

## 7. Plan testów

| Poziom | Narzędzie | Zakres |
| --- | --- | --- |
| Jednostkowe / API | pytest + PostgreSQL 16 | Każda nowa trasa: uprawnienia (401/403), walidacja, efekty w bazie, zdarzenia WS |
| Migracje | pytest (`test_migrations.py`) | upgrade/downgrade, zachowanie danych |
| Infrastruktura | pytest (`tests/infra`) + `bash -n` / shellcheck | Compose (porty, logi, healthchecki, wolumin bazy), skrypty |
| Kopie zapasowe | Docker (sandbox) | Pełny cykl: zrzut → weryfikacja w tymczasowym kontenerze → porównanie liczby wierszy |
| Panel | Vitest + Testing Library | Nowe ekrany, obsługa błędów API, tryb demo |
| Android | JUnit/Robolectric, `-PrealCore` | Nowe repozytoria/ViewModel, testy z prawdziwym Core |
| End-to-end | Docker Compose + Chromium (Playwright) | HTTPS, WSS, WebRTC ze źródłem testowym |
| Sprzęt | **Użytkownik** wg `docs/weryfikacja.md` | Kamera, BCS, telefon – nie do wykonania w środowisku budowania |

## 8. Kolejność wdrożenia na NAS (wyłącznie przez użytkownika, po akceptacji)

### 8.1 Przed wdrożeniem Etapu 0 – kontrola konfiguracji produkcji (bez Gita, wyniki bez sekretów)

```bash
cd "/volume1/Sztudio Smart Home/repository"
```

```bash
ls -la docker-compose*.yml compose*.yml; sudo docker compose -f docker-compose.yml -f compose.nas.yml ps
```

```bash
sudo docker inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' $(sudo docker ps -q -f label=com.docker.compose.service=db -f "label=com.docker.compose.project.working_dir=/volume1/Sztudio Smart Home/repository")
```

```bash
sudo docker inspect -f '{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}}{{println}}{{end}}' $(sudo docker ps -q -f label=com.docker.compose.service=db -f "label=com.docker.compose.project.working_dir=/volume1/Sztudio Smart Home/repository")
```

Pierwsze `inspect` pokazuje pliki Compose, z którymi działa stos (skrypty użyją dokładnie ich), drugie – katalog
danych bazy (oczekiwane: `bind /volume1/Sztudio Smart Home/postgres -> /var/lib/postgresql/data`).
Nie uruchamiaj `docker compose config` bez filtra – wypisuje wartości z `.env`.

### 8.2 Kolejność

1. Kopia zapasowa – **wykonana** przez użytkownika (sekcja 9). Dopisz do `.env` linię
   `SZTUDIO_BACKUP_DIR=/volume1/Sztudio Smart Home/backups`.
2. Etap 0: procedura „Pierwsza aktualizacja” z [aktualizacja-i-wycofanie.md](aktualizacja-i-wycofanie.md) –
   najpierw `--dry-run`, potem aktualizacja (zawiera kopię i jej weryfikację). Zmienia konfigurację kontenerów
   (logi, healthchecki, nginx), nie schemat bazy.
3. Po wdrożeniu: `sudo bash scripts/diagnostics.sh`, sprawdzenie panelu i kamer; w razie problemu – `ROLLBACK.txt`.
4. Każdy kolejny etap: `update.sh --dry-run` → `update.sh` → kontrola → test ręczny → ewentualne wycofanie.

## 9. Kopia zapasowa przed modernizacją

**Wykonana przez użytkownika** (2026-11-17, informacja od użytkownika): `pg_dump -Fc`, kontrola `pg_restore -l`
i `pg_restore --schema-only`, pełne odtworzenie do izolowanego kontenera PostgreSQL (10 tabel, migracja `0002`),
usunięcie kontenera testowego, kopia konfiguracji i certyfikatów; cztery usługi produkcyjne działają.
Autor nie ma dostępu do NAS-a i nie weryfikował tej kopii. Od Etapu 0 te same kroki (oraz weryfikację)
wykonują `scripts/backup.sh` i `scripts/verify-backup.sh`.

## 10. Kryteria ukończenia etapów

| Etap | Kryterium |
| --- | --- |
| 0 / 0.1 | Skrypty kopii, weryfikacji, odtwarzania, aktualizacji i wycofania przetestowane w symulacji NAS-a: bez Gita, Compose v5.1.3, `compose.nas.yml` z bind mountem bazy, ścieżki ze spacjami (pełny cykl 1.0 → 2.0 → wydanie z migracją → wycofania → kod identyczny z 1.0); testy Compose i skryptów przechodzą; brak regresji; dokumentacja odtworzenia i wycofania. **Wdrożenie na NAS wymaga decyzji użytkownika** |
| I | Nowe trasy z testami uprawnień; migracja addytywna z testem na danych; health z bazą; retencja w trybie raportu i wykonania; brak regresji panelu i Androida |
| II | main/sub i PTZ przetestowane atrapą ONVIF/RTSP **oraz** potwierdzone przez użytkownika na kamerze; funkcje bez potwierdzenia sprzętowego oznaczone jako niezweryfikowane |
| III | MQTT z uwierzytelnianiem tylko w LAN; reguły z testami (wyzwalacz → akcja); dotychczasowe alarmy czujników działają identycznie |
| IV | APK debug i release zbudowane, testy JVM przechodzą; test na telefonie wykonany przez użytkownika albo jawnie oznaczony jako niewykonany |
| V | Nowe ekrany z testami; `Cache-Control: no-store` dla API potwierdzony testem |
| VI | Raport z audytu z listą zmian i świadomie pozostawionych ryzyk |
| VII | Raport testów z rzeczywistymi wynikami; żaden niezweryfikowany element nie jest opisany jako gotowy |
