# Kopie zapasowe i odtwarzanie

Wszystkie polecenia uruchamia się **na serwerze** (NAS), w katalogu repozytorium. Na NAS-ie UGREEN:

```bash
cd "/volume1/Sztudio Smart Home/repository"
```

Skrypty nie wypisują zawartości `.env` ani kluczy prywatnych i nigdy nie usuwają woluminów ani bazy produkcyjnej.
**Git nie jest wymagany.** `.env` i klucze w `certs/` należą do roota – uruchamiaj skrypty przez `sudo`
(bez dostępu skrypt kończy się jednoznacznym błędem zamiast tworzyć niekompletną kopię):

```bash
sudo bash scripts/backup.sh
```

Skrypty używają tych samych plików Compose, z którymi działa stos (odczyt z etykiet kontenerów – na NAS-ie
`docker-compose.yml` + `compose.nas.yml`); przed każdą operacją wypisują ich listę. Jawnie:
`SZTUDIO_COMPOSE_FILES="docker-compose.yml:compose.nas.yml"`.

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
sudo bash scripts/backup.sh --label "przed zmianą konfiguracji"
```

Tworzy `SZTUDIO_BACKUP_DIR/sztudio-RRRRMMDD-GGMMSS/`:

| Plik | Zawartość |
| --- | --- |
| `sztudio.dump` | zrzut bazy `pg_dump -Fc`, wykonany w działającym kontenerze bazy (bez zatrzymywania usług) |
| `row-counts.txt` | liczba wierszy w tabelach – liczona przed i po zrzucie; przy różnicy (zapis w trakcie) zrzut jest powtarzany |
| `dump-contents.txt` | spis zawartości zrzutu (`pg_restore --list`) – dowód, że zrzut jest czytelny |
| `config.tar.gz` | **zawiera sekrety**: `.env*`; wszystkie pliki Compose z katalogu (`docker-compose*.yml`, `compose*.yml` – w tym `compose.nas.yml` i override) oraz pliki Compose użyte przez stos, jeśli leżą poza katalogiem; `docker/` (konfiguracja nginx i go2rtc); `certs/` (certyfikaty publiczne i klucze prywatne serwera i CA); `VERSION`, `.sztudio-release/` |
| `config-files.sha256` | suma SHA-256 każdego pliku konfiguracji – weryfikacja porównuje z nią treść archiwum |
| `version.txt` | wersja kodu (`VERSION`; commit tylko, gdy Git jest dostępny) |
| `manifest.txt`, `SHA256SUMS` | opis kopii (pliki Compose, katalog danych bazy, obraz i wersja PostgreSQL) i sumy kontrolne |

Kopia jest przerywana, gdy brakuje któregoś z plików: `.env`, `docker-compose.yml`, `docker/nginx/default.conf.template`,
`docker/go2rtc.yaml`, `certs/public/server.crt`, `certs/public/server.key`, albo gdy któryś plik konfiguracji jest
nieczytelny. Dane bazy z `/volume1/Sztudio Smart Home/postgres` są kopiowane wyłącznie jako zrzut `pg_dump`
(kopia plików działającej bazy nie byłaby spójna).

Uprawnienia: katalog `700`, pliki `600`. Retencja: zostaje 14 najnowszych kopii utworzonych przez skrypt
(`--keep N`, `--keep 0` = bez usuwania). Usuwane są wyłącznie katalogi o nazwie `sztudio-RRRRMMDD-GGMMSS`
z plikiem znacznika `.sztudio-backup` – Twoje ręczne kopie (np. `pre-2.0-…`) nie są nigdy usuwane.
Kopie sprzed aktualizacji (z katalogiem `update/` – punkty wycofania) również nie podlegają retencji.
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
sudo bash scripts/verify-backup.sh
```

Bez argumentu – najnowsza kopia ręczna; można podać katalog kopii albo plik `auto/….dump`.
Skrypt sprawdza sumy kontrolne, odtwarza zrzut w **tymczasowym kontenerze PostgreSQL bez sieci, z danymi
w pamięci**, porównuje liczbę wierszy każdej tabeli z zapisaną w chwili kopii, sprawdza obecność schematu
Sztudio (`alembic_version`, `users`), a w `config.tar.gz` – obecność wymaganych plików i treść **każdego** pliku
względem `config-files.sha256` (odczyt strumieniowy, sekrety nie są zapisywane na dysk). Kontener jest usuwany po teście. Baza
produkcyjna nie jest używana. Kod wyjścia `0` tylko dla poprawnej kopii.

Weryfikuj kopie regularnie (np. raz w miesiącu) – kopia, której nie sprawdzono, może nie dać się odtworzyć.

## Odtworzenie bazy

```bash
sudo bash scripts/restore.sh "/volume1/Sztudio Smart Home/backups/sztudio-RRRRMMDD-GGMMSS"
```

Skrypt pyta o potwierdzenie (wpisanie `PRZYWRÓĆ`), a następnie:

1. sprawdza sumy kontrolne kopii (bez sum – odmawia),
2. wykonuje **nową kopię obecnego stanu** (przerywa, jeśli się nie uda),
3. odtwarza zrzut do nowej bazy `sztudio_restore_<czas>` i sprawdza ją **przed zamianą**: schemat Sztudio
   i liczba wierszy zgodna z kopią (przy niezgodności nowa baza jest usuwana, obecna pozostaje bez zmian),
4. zatrzymuje Core (i usługę backup), zamienia nazwy **w jednej transakcji**: obecna baza →
   `sztudio_before_restore_<czas>`, odtworzona → `sztudio` (albo obie zmiany, albo żadna),
5. uruchamia zatrzymane usługi i czeka na healthcheck Core. Przy błędzie w krokach 4–5 przed zamianą usługi są
   uruchamiane ponownie, a obecna baza pozostaje bez zmian.

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

**Symulacja NAS-a (Etap 0.1)** – katalogi `…/Sztudio Smart Home/{repository,postgres,backups}` (spacje w ścieżkach),
wersja 1.0 skopiowana bez `.git`, `compose.nas.yml` z bind mountem danych bazy, **Docker Compose v5.1.3**
(jak na NAS-ie), środowisko **bez `git`, `unzip` i `python3`**, osobny `.env` wyłącznie z testowymi sekretami:

- `backup.sh` + `verify-backup.sh`: 10 tabel i schemat `0002` po odtworzeniu, 15 plików konfiguracji zgodnych
  z sumami (w tym `compose.nas.yml`, nginx, go2rtc, klucze prywatne, plik Compose spoza katalogu);
- uruchomienie bez sudo: jednoznaczny błąd (brak dostępu do `.env` / kluczy), żadna niekompletna kopia;
- `restore.sh`: uszkodzona kopia i zrzut innej bazy odrzucone bez zmian; wymuszony błąd zamiany nazw – transakcja
  wycofana, Core uruchomiony ponownie, baza `sztudio` nietknięta;
- retencja: obcy katalog o pasującej nazwie, ręczna kopia i punkt wycofania (`update/`) zachowane;
- usługa `backup` (profil) na Compose v5.1.3: zrzut po migracjach, weryfikacja poprawna;
- pełne cykle aktualizacji i wycofania – opis w [aktualizacja-i-wycofanie.md](aktualizacja-i-wycofanie.md)
  i w dzienniku zmian;
- logi wszystkich przebiegów i raport diagnostyczny: 0 wystąpień testowych haseł, tokenów i kluczy.

Testy automatyczne konfiguracji i skryptów: `core/.venv/bin/pytest tests/infra` (91 testów).
**Na NAS-ie skrypty nie były uruchamiane** – pierwsze użycie wykonaj z weryfikacją (`sudo bash scripts/verify-backup.sh`).
