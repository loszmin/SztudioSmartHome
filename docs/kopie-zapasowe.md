# Kopie zapasowe i odtwarzanie

Wszystkie polecenia uruchamia się **na serwerze** (NAS), w katalogu repozytorium. Na NAS-ie UGREEN:

```bash
cd "/volume1/Sztudio Smart Home/repository"
```

Skrypty nie wypisują zawartości `.env` ani kluczy prywatnych i nigdy nie usuwają woluminów ani bazy produkcyjnej.

## Co trzeba chronić

| Element | Gdzie | Skutek utraty |
| --- | --- | --- |
| Baza PostgreSQL | wolumin bazy (na NAS-ie `/volume1/Sztudio Smart Home/postgres`) | utrata kamer, rejestratorów, czujników, alarmów, historii, kont |
| `.env` | katalog repozytorium | **`SZTUDIO_SECRET_KEY` szyfruje hasła kamer i rejestratorów** – bez niego zapisane hasła są nie do odczytania (trzeba je wpisać ponownie); utrata haseł bazy i go2rtc |
| `certs/ca/sztudio-ca.key` + `certs/public/` | katalog repozytorium | nowy urząd certyfikacji = ponowna instalacja certyfikatu na wszystkich komputerach i telefonach |

Dlatego pełna kopia to **zrzut bazy + `.env` + `certs/`**. Sam zrzut bazy bez `.env` nie wystarczy do pełnego odtworzenia.

## Katalog kopii

Domyślnie `./backups` w repozytorium (ignorowany przez Git). Na NAS-ie dopisz do `.env` jedną linię
(nie zmieniaj pozostałych wartości):

```
SZTUDIO_BACKUP_DIR=/volume1/Sztudio Smart Home/backups
```

Z tego klucza korzystają skrypty i usługa automatycznych kopii. Skrypty odczytują z `.env` wyłącznie ten klucz.
Można go też podać jednorazowo: `SZTUDIO_BACKUP_DIR=/inny/katalog scripts/backup.sh` lub `scripts/backup.sh --dir …`.

## Kopia ręczna (pełna)

```bash
scripts/backup.sh --label "przed zmianą konfiguracji"
```

Tworzy `SZTUDIO_BACKUP_DIR/sztudio-RRRRMMDD-GGMMSS/`:

| Plik | Zawartość |
| --- | --- |
| `sztudio.dump` | zrzut bazy `pg_dump -Fc`, wykonany w działającym kontenerze bazy (bez zatrzymywania usług) |
| `row-counts.txt` | liczba wierszy w tabelach – liczona przed i po zrzucie; przy różnicy (zapis w trakcie) zrzut jest powtarzany |
| `dump-contents.txt` | spis zawartości zrzutu (`pg_restore --list`) – dowód, że zrzut jest czytelny |
| `config.tar.gz` | `.env`, `certs/` (z kluczem CA), pliki Compose, także `docker-compose.override.yml` – **zawiera sekrety** |
| `git.txt`, `git-local-changes.diff` | wersja kodu i lokalne zmiany w plikach śledzonych |
| `manifest.txt`, `SHA256SUMS` | opis kopii (obraz i wersja PostgreSQL) i sumy kontrolne |

Uprawnienia: katalog `700`, pliki `600`. Retencja: zostaje 14 najnowszych kopii utworzonych przez skrypt
(`--keep N`, `--keep 0` = bez usuwania). Katalogi o innych nazwach (np. ręczne `pre-2.0-…`) nie są nigdy usuwane.
`--no-config` pomija archiwum z sekretami (np. kopia przekazywana do analizy).

**Kopię poza NAS-em** (dysk USB, drugi serwer) wykonuj samodzielnie – kopia na tym samym dysku nie chroni przed
awarią dysku. `config.tar.gz` przechowuj wyłącznie w zaufanym miejscu.

## Kopie automatyczne

Usługa `backup` w Compose (profil `backup`, domyślnie wyłączona): zrzut bazy przy starcie i co
`SZTUDIO_BACKUP_INTERVAL_HOURS` godzin (domyślnie 24), zostawia `SZTUDIO_BACKUP_KEEP` (14) najnowszych
w `SZTUDIO_BACKUP_DIR/auto/`. Każdy zrzut jest sprawdzany `pg_restore --list` i ma sumę SHA-256 i liczby wierszy.
Startuje dopiero, gdy Core jest zdrowy (po migracjach). Healthcheck usługi = ostatnia udana kopia
młodsza niż dwa odstępy.

Włączenie – dopisz do `.env`:

```
COMPOSE_PROFILES=backup
```

```bash
docker compose up -d backup
```

Stan: `docker compose ps backup` (kolumna health), `docker compose logs backup`.

Usługa kopiuje **tylko bazę**. `.env` i `certs/` zmieniają się rzadko – kopiuj je `scripts/backup.sh`
po każdej zmianie konfiguracji (albo cyklicznie przez harmonogram zadań UGOS / `cron` roota, np. raz w tygodniu:
`cd "/volume1/Sztudio Smart Home/repository" && scripts/backup.sh --label cron`).

## Weryfikacja kopii (nieniszcząca)

```bash
scripts/verify-backup.sh
```

Bez argumentu – najnowsza kopia ręczna; można podać katalog kopii albo plik `auto/….dump`.
Skrypt sprawdza sumy kontrolne, odtwarza zrzut w **tymczasowym kontenerze PostgreSQL bez sieci, z danymi
w pamięci**, porównuje liczbę wierszy każdej tabeli z zapisaną w chwili kopii, sprawdza obecność schematu
Sztudio (`alembic_version`, `users`) i czytelność `config.tar.gz`. Kontener jest usuwany po teście. Baza
produkcyjna nie jest używana. Kod wyjścia `0` tylko dla poprawnej kopii.

Weryfikuj kopie regularnie (np. raz w miesiącu) – kopia, której nie sprawdzono, może nie dać się odtworzyć.

## Odtworzenie bazy

```bash
scripts/restore.sh "/volume1/Sztudio Smart Home/backups/sztudio-RRRRMMDD-GGMMSS"
```

Skrypt pyta o potwierdzenie (wpisanie `PRZYWRÓĆ`), a następnie:

1. sprawdza sumy kontrolne kopii,
2. wykonuje **nową kopię obecnego stanu** (przerywa, jeśli się nie uda),
3. odtwarza zrzut do nowej bazy `sztudio_restore_<czas>` (przy błędzie obecna baza pozostaje bez zmian),
4. zatrzymuje Core (i usługę backup), zamienia nazwy: obecna baza → `sztudio_before_restore_<czas>`,
   odtworzona → `sztudio`,
5. uruchamia zatrzymane usługi i czeka na healthcheck Core.

**Poprzednia baza nie jest usuwana.** Lista baz:

```bash
docker compose exec -T db psql -U sztudio -d postgres -c "\l"
```

Powrót do poprzedniej bazy (Core zatrzymany na czas zamiany):

```bash
docker compose stop core
```

```bash
docker compose exec -T db psql -U sztudio -d postgres -c 'ALTER DATABASE sztudio RENAME TO sztudio_odrzucona' -c 'ALTER DATABASE "sztudio_before_restore_RRRRMMDD_GGMMSS" RENAME TO sztudio'
```

```bash
docker compose start core
```

Zbędną bazę usuń dopiero, gdy masz pewność, że nie jest potrzebna (operacja nieodwracalna):
`docker compose exec -T db psql -U sztudio -d postgres -c 'DROP DATABASE "nazwa"'`.

## Odtworzenie konfiguracji (.env, certyfikaty)

Tylko przy przenoszeniu na nowy serwer albo po utracie plików – na działającym serwerze nadpisanie `.env`
lub certyfikatów zmienia hasła i zaufanie urządzeń. Rozpakuj archiwum do katalogu tymczasowego i skopiuj
potrzebne pliki ręcznie:

```bash
mkdir -m 700 /tmp/sztudio-config && tar -xzf "KATALOG_KOPII/config.tar.gz" -C /tmp/sztudio-config
```

Na nowym serwerze: skopiuj `.env` i `certs/` do katalogu repozytorium **przed** pierwszym `docker compose up`
(wtedy usługa `certs` zachowa istniejący urząd), uruchom bazę (`docker compose up -d db`), odtwórz zrzut
`scripts/restore.sh`, następnie `docker compose up -d`. Po zakończeniu usuń `/tmp/sztudio-config`.

## Jak to zostało sprawdzone

Na stosie Docker Compose w środowisku deweloperskim (PostgreSQL 16, Core, go2rtc, nginx, testowe źródło RTSP),
z osobnym `.env` zawierającym wyłącznie testowe sekrety i katalogiem kopii ze spacją w nazwie:

- kopia ręczna → weryfikacja (10 tabel, liczby wierszy zgodne) → zmiana danych → `restore.sh` → zmiana cofnięta,
  poprzednia baza zachowana, logowanie przez HTTPS działa;
- kopia automatyczna przy starcie i jej weryfikacja; zrzut pustej bazy oraz uszkodzony plik (zmieniony bajt)
  są odrzucane przez `verify-backup.sh`;
- aktualizacja przez `scripts/update.sh` do wersji z dodatkową migracją i wycofanie wg wygenerowanego
  `ROLLBACK.txt` (powrót do schematu `0002`, wszystkie usługi zdrowe);
- raport diagnostyczny, logi i wyniki skryptów przeszukane pod kątem testowych haseł, tokenu JWT i kluczy – 0 wystąpień.

Testy automatyczne konfiguracji i skryptów: `core/.venv/bin/pytest tests/infra`.
**Na NAS-ie skrypty nie były uruchamiane** – pierwsze użycie wykonaj z weryfikacją (`scripts/verify-backup.sh`).
