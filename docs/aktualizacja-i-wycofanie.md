# Aktualizacja i wycofanie wersji

Aktualizację wykonuje wyłącznie administrator serwera, ręcznie. Panel WWW i aplikacja nie uruchamiają poleceń na NAS-ie.

## Przed pierwszą aktualizacją z wersji 1.0

Wersja 1.0 nie zawiera skryptów z tego dokumentu. Pierwszą kopię wykonaj poleceniami ręcznymi z
[SZTUDIO_SMART_HOME_2.0_PLAN.md, sekcja 9](SZTUDIO_SMART_HOME_2.0_PLAN.md#9-kopia-zapasowa-przed-modernizacją-do-wykonania-przez-użytkownika)
i sprawdź konfigurację produkcji (sekcja 8.1). Jeśli `git status` pokazuje zmiany w `docker-compose.yml`
(np. ścieżka danych bazy `/volume1/Sztudio Smart Home/postgres`), przenieś je do `docker-compose.override.yml`
**przed** aktualizacją – inaczej `git merge` się nie uda, a nowa wersja pliku nie zawierałaby Twojej ścieżki.

Przykład `docker-compose.override.yml` dla danych bazy w katalogu NAS-a (dostosuj do tego, co pokazało
polecenie z sekcji 8.1 planu – ścieżka musi być **dokładnie** ta, w której teraz leżą dane):

```yaml
services:
  db:
    volumes:
      - "/volume1/Sztudio Smart Home/postgres:/var/lib/postgresql/data"
```

Compose łączy woluminy według ścieżki w kontenerze, więc ten wpis zastępuje `db-data` z `docker-compose.yml`.

Po utworzeniu pliku sprawdź, że Compose widzi tę samą ścieżkę, zanim cokolwiek uruchomisz:

```bash
docker compose config db | grep -A4 "volumes:"
```

Oczekiwane `source: /volume1/Sztudio Smart Home/postgres` i `target: /var/lib/postgresql/data`
(filtr `grep` jest celowy – pełny wynik `docker compose config` zawiera hasła z `.env`).

### Pierwsza aktualizacja (1.0 → wersja ze skryptami)

Skrypt `update.sh` jest dopiero w nowej wersji, więc pierwszy raz wykonaj kroki ręcznie (po kopii z sekcji 9 planu):

```bash
git fetch origin && git status --short --untracked-files=no
```

Wynik `git status` musi być pusty (inaczej – najpierw override, jak wyżej).

```bash
docker image tag sztudio-core:local sztudio-core:rollback-1.0
```

```bash
git merge --ff-only origin/feature/sztudio-smart-home-2.0
```

```bash
docker compose up -d --build && docker compose ps
```

Etap 0 nie zmienia schematu bazy. Wycofanie: `git reset --keep ORIG_HEAD`, `docker tag sztudio-core:rollback-1.0 sztudio-core:local`,
`docker compose up -d --build`. Kolejne aktualizacje – już przez `scripts/update.sh`.

## Aktualizacja

```bash
scripts/update.sh --dry-run origin/feature/sztudio-smart-home-2.0
```

Tryb `--dry-run` pokazuje listę zmian i ostrzeżenie o migracjach bazy, niczego nie zmienia. Następnie:

```bash
scripts/update.sh origin/feature/sztudio-smart-home-2.0
```

(albo tag wydania, np. `v2.0.0`). Skrypt:

1. przerywa, gdy w plikach śledzonych są lokalne zmiany albo wersja docelowa nie jest kontynuacją obecnej,
2. wykonuje `scripts/backup.sh` i `scripts/verify-backup.sh` – przy błędzie przerywa bez zmian,
3. oznacza obecne obrazy jako `sztudio-core:rollback-<commit>` i `sztudio-web:rollback-<commit>`,
4. `git merge --ff-only` (bez nadpisywania historii), kopiuje narzędzia nowej wersji do katalogu kopii,
5. `docker compose build` i `up -d`, czeka do 3 minut na healthchecki wszystkich usług,
6. zapisuje `ROLLBACK.txt` z gotowymi poleceniami wycofania w katalogu kopii.

Migracje bazy wykonuje Core przy starcie. Po aktualizacji: otwórz panel, sprawdź kamery i uruchom

```bash
scripts/diagnostics.sh --output /tmp/sztudio-diagnostyka.txt
```

## Wycofanie

Wykonaj polecenia z `ROLLBACK.txt` z katalogu kopii utworzonej przy aktualizacji. Ich postać:

```bash
cd "/volume1/Sztudio Smart Home/repository"
docker compose stop core
git reset --keep <poprzedni-commit>
docker tag sztudio-core:rollback-<commit> sztudio-core:local
docker tag sztudio-web:rollback-<commit> sztudio-web:local
# tylko gdy aktualizacja zawierała migracje bazy:
SZTUDIO_ROOT="…/repository" "…/backups/sztudio-…/tools/restore.sh" "…/backups/sztudio-…"
docker compose up -d --no-build
```

- `git reset --keep` przesuwa gałąź z powrotem i odmawia, jeśli nadpisałby lokalne zmiany.
- Obrazy `rollback-…` pozwalają wrócić bez ponownego budowania.
- Gdy wersja zawierała migracje, stara wersja Core nie uruchomi się na nowszym schemacie – wtedy odtwarzana
  jest kopia sprzed aktualizacji (`restore.sh` z kopii narzędzi; obecna baza zostaje zachowana pod inną nazwą).
  Dane zapisane po aktualizacji (nowe zdarzenia, zmiany konfiguracji) nie trafią do odtworzonej bazy.
- Przy wycofaniu do 1.0 obraz panelu w 1.0 nie ma nazwy `sztudio-web` – Compose użyje obrazu
  `<projekt>-web` zbudowanego wcześniej. Jeśli został usunięty, wykonaj `docker compose up -d --build`.

## Nigdy

- `docker compose down -v`, `docker volume rm/prune`, `docker system prune --volumes` – usuwają dane bazy.
- Zmiana definicji woluminu bazy bez sprawdzenia `docker compose config db` – baza wystartowałaby pusta.
- Regenerowanie `certs/ca/` – wymaga ponownej instalacji certyfikatu na wszystkich urządzeniach.
- Zmiana `SZTUDIO_SECRET_KEY` – zapisane hasła kamer i rejestratorów stają się nieczytelne.
