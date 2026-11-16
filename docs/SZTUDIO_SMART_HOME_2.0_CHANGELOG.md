# Sztudio Smart Home 2.0 – dziennik zmian

Gałąź: `feature/sztudio-smart-home-2.0`. Plan i audyt: [SZTUDIO_SMART_HOME_2.0_PLAN.md](SZTUDIO_SMART_HOME_2.0_PLAN.md).
Każdy wpis rozróżnia: **sprawdzone** (z rzeczywistym wynikiem testu), **niesprawdzone na NAS-ie / sprzęcie**.

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
