# Sztudio Smart Home 2.0 – dziennik zmian

Gałąź: `feature/sztudio-smart-home-2.0`. Plan i audyt: [SZTUDIO_SMART_HOME_2.0_PLAN.md](SZTUDIO_SMART_HOME_2.0_PLAN.md).
Każdy wpis rozróżnia: **sprawdzone** (z rzeczywistym wynikiem testu), **niesprawdzone na NAS-ie / sprzęcie**.

## Etap 0.1 – audyt i poprawki skryptów pod produkcyjny NAS (2026-11-17)

Kontekst od użytkownika: na NAS-ie **nie ma Gita**, dane bazy w `/volume1/Sztudio Smart Home/postgres`
(bind mount), Docker Compose v5.1.3, możliwy `compose.nas.yml`; kopia produkcji wykonana i odtworzona ręcznie.
Bez zmian kodu Core, panelu i aplikacji Android; bez zmian schematu bazy.

### Znalezione problemy

| # | Problem | Waga | Skrypt |
| --- | --- | --- | --- |
| 1 | `require_cmd docker tar git` – kopia nie działała bez Gita | Krytyczna | backup.sh |
| 2 | Aktualizacja w całości oparta na Gicie (`fetch`, `merge --ff-only`, `reset --keep`) – na NAS-ie niewykonalna | Krytyczna | update.sh |
| 3 | `docker compose` bez `-f compose.nas.yml`: konfiguracja bez bind mountu bazy; `up -d` w aktualizacji/wycofaniu podłączyłby pusty wolumin `db-data` | Krytyczna | wszystkie |
| 4 | Kopia konfiguracji bez `compose.nas.yml`, `docker/` (nginx, go2rtc), plików Compose spoza katalogu | Wysoka | backup.sh |
| 5 | Brak sudo: pliki root-owned (`.env`, klucze) – brak jednoznacznego komunikatu; mylący błąd „db nie działa” | Wysoka | wszystkie |
| 6 | Zamiana nazw baz poza transakcją; po błędzie Core pozostawał zatrzymany | Wysoka | restore.sh |
| 7 | Pułapka `ERR` nie działała wewnątrz funkcji (bash bez `set -E`) – wykryte wymuszonym błędem | Wysoka | restore.sh |
| 8 | Odtwarzanie bez kontroli schematu i liczby wierszy przed zamianą baz; zrzut bez sumy akceptowany | Średnia | restore.sh |
| 9 | Weryfikacja archiwum konfiguracji tylko „czy się rozpakowuje” – bez kontroli kompletności i treści | Średnia | verify-backup.sh |
| 10 | Retencja usuwała kopie sprzed aktualizacji (punkty wycofania) | Średnia | backup.sh |
| 11 | Retencja rozpoznawała kopie wyłącznie po nazwie | Niska | backup.sh |
| 12 | Raport bez informacji o wersji przy braku Gita („0 zmienionych plików” zamiast „nieznane”) | Niska | diagnostics.sh |

Wykryte dopiero w testach na symulacji NAS-a (i poprawione):

- pliki z archiwum `.zip` z uprawnieniami `600` / bez bitu wykonywania – Core (użytkownik nieuprzywilejowany) nie
  odczytałby nowego kodu w obrazie, skrypty potomne nie dałyby się uruchomić → uprawnienia 644/755, wywołania przez `bash`;
- `.env.example` objęty ochroną wzorca `.env.*` – nigdy by się nie aktualizował;
- usługa `certs` oceniana jako „unhealthy” (healthcheck odziedziczony z obrazu Core) → healthcheck wyłączony,
  ocena kontenerów zakończonych po kodzie wyjścia;
- nieudane budowanie zostawiało tag `sztudio-web:local` na obrazie nowej wersji → przywracanie tagów przy cofnięciu;
- puste katalogi po wycofaniu; plik Compose spoza katalogu pomijany w kopii (rozpoznawanie w podpowłoce).

### Zmiany

- `scripts/lib/common.sh`: pliki Compose z etykiet działającego stosu (`com.docker.compose.project.config_files`)
  albo `SZTUDIO_COMPOSE_FILES`, albo `compose.nas.yml`; **strażnik danych bazy** (`check_db_mount`) porównujący
  montowanie w kontenerze z konfiguracją; kontrola dostępu do `.env`; `code_version` (plik `VERSION`, Git opcjonalnie);
  lista plików chronionych; wspólne `wait_healthy`, `restore_image_tags`, `remove_listed_files`.
- `scripts/backup.sh`: bez Gita; pełna konfiguracja z `config-files.sha256`; przerwanie przy braku wymaganych lub
  nieczytelnych plików; manifest z plikami Compose i katalogiem danych bazy; znacznik `.sztudio-backup`; retencja
  pomija punkty wycofania.
- `scripts/verify-backup.sh`: kontrola treści każdego pliku konfiguracji (strumieniowo) i obecności wymaganych.
- `scripts/restore.sh`: kontrola schematu i liczby wierszy przed zamianą, zamiana w jednej transakcji, pułapka `EXIT`
  (ponowne uruchomienie usług, usunięcie tylko własnej bazy tymczasowej), wymóg sum kontrolnych.
- `scripts/update.sh` (przepisany): `--from` katalog / `.tar.gz` / `.zip` (busybox z obrazu bazy, gdy brak `unzip`
  i Pythona), manifest wydania `.sztudio-release/`, pliki chronione nienaruszalne, kopia + weryfikacja, dane do
  wycofania w `update/`, strażnik przed i po podmianie, cofnięcie plików i tagów przy błędzie przed uruchomieniem.
- `scripts/rollback.sh` (nowy): wycofanie kodu, obrazów i – przy migracjach – bazy; powtarzalny.
- `scripts/diagnostics.sh`: wersja bez Gita, pliki Compose stosu, katalog danych bazy (kontener i konfiguracja).
- `docker-compose.yml`: `certs` bez odziedziczonego healthchecka. `VERSION`: `2.0.0-dev.0.1`.
- Testy: `tests/infra` – 91 testów (było 56). Dokumentacja: kopie, aktualizacja (bez Gita), plan, README.

### Wyniki testów

| Test | Wynik |
| --- | --- |
| ShellCheck – wszystkie skrypty | 0 uwag |
| `tests/infra` | 90 / 90 jako root + 1 / 1 (scenariusz bez dostępu do `.env`) jako zwykły użytkownik |
| Backend (pytest) | 133 / 133 |
| Panel WWW (Vitest) + build | 65 / 65, build OK |
| Android (JVM) | 54 / 54 |

Symulacja NAS-a: `…/nas sim/Sztudio Smart Home/{repository,postgres,backups,releases}`, wersja 1.0 (`ebc3c96`) bez
`.git`, `compose.nas.yml` z bind mountem danych bazy, **Docker Compose v5.1.3** (binarka z GitHuba, suma SHA-256
zgodna), środowisko **bez `git`, `unzip`, `python3`**, wydanie jako ZIP w stylu GitHuba **bez uprawnień Unix**:

| Scenariusz | Wynik |
| --- | --- |
| Kopia na 1.0 bez Gita + weryfikacja (10 tabel, `0002`, 15 plików konfiguracji, plik Compose spoza katalogu) | OK |
| Kopia bez sudo (`.env` / klucze root) | jednoznaczny błąd, brak niekompletnej kopii – OK |
| Aktualizacja 1.0 → 2.0 z rozpakowanego ZIP (procedura pierwszej aktualizacji); `--dry-run` z pliku ZIP | OK – usługi zdrowe, właściciel i uprawnienia plików poprawne, `.env`/`certs` nietknięte, HTTPS 200, restart Core z nowym IP bez 502 |
| Aktualizacja 2.0 → wydanie z migracją `0003` (`.tar.gz`), usunięcie pliku wg manifestu | OK |
| Nieudane budowanie (uszkodzony `pyproject.toml`) | pliki identyczne jak przed, tagi obrazów przywrócone, działający kontener nietknięty |
| Strażnik: konfiguracja bez `compose.nas.yml` | przerwanie przed jakąkolwiek zmianą |
| `restore.sh`: uszkodzona kopia; zrzut innej bazy; wymuszony błąd zamiany nazw | odrzucone / baza nietknięta, Core uruchomiony ponownie |
| Wycofanie z bazą (`0003` → `0002`) i do 1.0 wg `ROLLBACK.txt` | OK – **kod identyczny z 1.0 co do bajtu**, dane bazy na bind mouncie, logowanie 200 |
| Retencja: obcy katalog, kopia ręczna, punkt wycofania | zachowane |
| Usługa `backup` (profil) na Compose v5.1.3 | zrzut po migracjach, weryfikacja OK |
| Wyciek sekretów (logi wszystkich przebiegów, raport) | 0 |

### Niesprawdzone

- **Nic nie zostało uruchomione na NAS-ie** (brak dostępu; zgodnie z poleceniem). UGOS może różnić się od symulacji
  (Debian/Ubuntu z GNU coreutils i GNU tar w sandboxie): do potwierdzenia `--dry-run` na NAS-ie.
- Rzeczywisty `compose.nas.yml` i `.env` produkcji nie były widziane – symulacja zakłada bind mount danych bazy
  w `compose.nas.yml` i stos uruchamiany z `-f docker-compose.yml -f compose.nas.yml`.

## Etap 0 – bezpieczeństwo danych i operacje (2026-11-16)

Bez zmian kodu Core, panelu i aplikacji Android; bez zmian schematu bazy i definicji woluminu bazy.

### Dodane

- `scripts/backup.sh` – pełna kopia: zrzut bazy (`pg_dump -Fc`) z kontrolą czytelności i spójnymi liczbami wierszy,
  archiwum `.env` + `certs/` + pliki Compose (bez wyświetlania), stan Git, sumy SHA-256, uprawnienia 700/600,
  retencja wyłącznie własnych katalogów.
- `scripts/verify-backup.sh` – odtworzenie zrzutu w tymczasowym kontenerze PostgreSQL bez sieci, porównanie
  liczby wierszy, kontrola schematu i sum; produkcyjna baza nie jest używana.
- `scripts/restore.sh` – odtworzenie do nowej bazy i zamiana nazw; poprzednia baza zachowana, kopia przed odtworzeniem.
- `scripts/update.sh` – aktualizacja `--ff-only` z kopią i weryfikacją, tagami obrazów `rollback-<commit>`,
  oczekiwaniem na healthchecki i plikiem `ROLLBACK.txt`; tryb `--dry-run`.
- `scripts/diagnostics.sh` – raport bez sekretów (kontenery, healthchecki, porty, obrazy, limity logów, Alembic,
  certyfikaty publiczne, uprawnienia plików z sekretami, dyski, kopie, logi z maskowaniem).
- Usługa Compose `backup` (profil `backup`, opcjonalna) i `docker/backup/backup-loop.sh` – automatyczne zrzuty bazy.
- `tests/infra/test_infrastructure.py` – 56 testów konfiguracji Compose, nginx i skryptów.
- `.shellcheckrc`; dokumentacja: `docs/kopie-zapasowe.md`, `docs/aktualizacja-i-wycofanie.md`, plan i ten dziennik.

### Zmienione

- `docker-compose.yml`: rotacja logów wszystkich usług (`json-file`, 10 MB × 5, konfigurowalne), healthchecki `web`
  i `go2rtc`, `no-new-privileges` dla `core`, `go2rtc`, `web`, `certs`, `backup` (bez `db`), nazwa obrazu
  `sztudio-web:local` (potrzebna do wycofania).
- `docker/nginx/default.conf.template`: port kontrolny `127.0.0.1:8081/healthz` (tylko wewnątrz kontenera);
  **dynamiczne rozwiązywanie nazwy `core`** (`resolver 127.0.0.11`).
- `.gitignore`: katalog `backups/`.

### Naprawione

- **nginx zwracał 502 po restarcie lub ponownym utworzeniu kontenera Core**, gdy Core dostał nowy adres IP (nginx
  rozwiązywał nazwę tylko przy starcie). Wykryte podczas testu odtworzenia; dotyczyło też wersji 1.0 przy
  `docker compose up -d` odtwarzającym tylko Core. Sprawdzone: restart Core z nowym IP → logowanie 200.

### Wykryte i poprawione w trakcie testów etapu

- Automatyczna kopia przy starcie wykonywała się przed migracjami (zrzut pustej bazy) → usługa czeka na zdrowy Core.
- `verify-backup.sh` uznawał zrzut bez schematu Sztudio za poprawny → kontrola `alembic_version` i `users`.
- Liczby wierszy liczone po zrzucie mogły różnić się od zawartości zrzutu → liczenie przed i po, z powtórzeniem.
- Instrukcja wycofania zakładała, że `restore.sh` istnieje w starszej wersji → kopia narzędzi w katalogu kopii,
  zatrzymanie Core przed `git reset`.

### Wyniki testów

| Zestaw | Wynik |
| --- | --- |
| Backend (pytest) | 133 / 133 (bez zmian) |
| Panel WWW (Vitest) | 65 / 65 (bez zmian) |
| Android (JVM) | 54 / 54 (bez zmian) |
| Infrastruktura (`tests/infra`) | 56 / 56 |
| shellcheck (wszystkie skrypty) | 0 uwag |
| Cykl na stosie Docker: kopia → weryfikacja → zmiana → odtworzenie | OK |
| Kopia automatyczna + weryfikacja; odrzucenie pustego i uszkodzonego zrzutu | OK |
| `update.sh` do wersji z migracją + wycofanie wg `ROLLBACK.txt` | OK (schemat 0003 → 0002) |
| WebRTC w Chromium przez nowy proxy nginx (testowe RTSP) | OK – 1280×720, klatki odbierane, WSS połączony |
| Wyciek sekretów (raport, logi skryptów) | 0 wystąpień testowych haseł, tokenu i kluczy |

### Niesprawdzone

- **Żaden skrypt nie był uruchomiony na NAS-ie** (brak dostępu). Nieznana jest rzeczywista konfiguracja produkcji
  (wolumin bazy w `/volume1/…/postgres`, ewentualny override, wersja Docker Compose w UGOS).
- Kopia zapasowa produkcji przed modernizacją **nie została wykonana przez autora** – polecenia w planie, sekcja 9.
