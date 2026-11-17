# Aktualizacja i wycofanie wersji

Aktualizację wykonuje wyłącznie administrator serwera, ręcznie. Panel WWW i aplikacja nie uruchamiają poleceń na NAS-ie.
**Git nie jest potrzebny** – nowa wersja jest dostarczana jako archiwum (np. „Code → Download ZIP” na GitHubie).

Ścieżki w przykładach odpowiadają NAS-owi UGREEN DXP2800:

| Element | Ścieżka |
| --- | --- |
| Instalacja | `/volume1/Sztudio Smart Home/repository` |
| Dane PostgreSQL (bind mount z `compose.nas.yml`) | `/volume1/Sztudio Smart Home/postgres` |
| Kopie zapasowe | `/volume1/Sztudio Smart Home/backups` |
| Wydania (proponowane) | `/volume1/Sztudio Smart Home/releases` |

Pliki `.env` i `certs/` należą do roota – skrypty uruchamia się przez `sudo`.

## Jak działa aktualizacja

`scripts/update.sh --from WYDANIE`:

1. rozpakowuje wydanie (katalog, `.tar.gz` albo `.zip`; bez `unzip` i Pythona używa busybox z obrazu bazy),
   sprawdza, że to wydanie Sztudio (`VERSION`, `scripts/rollback.sh`, `core/alembic/versions`),
2. porównuje pliki z instalacją: nowe, zmienione, usunięte w nowej wersji; wykrywa zmianę migracji bazy,
3. ustala pliki Compose **z etykiet działającego stosu** – dokładnie te, z którymi stos został uruchomiony
   (np. `docker-compose.yml` + `compose.nas.yml`) – i sprawdza, że katalog danych bazy się zgadza,
4. wykonuje i weryfikuje kopię zapasową (`backup.sh`, `verify-backup.sh`) – przy błędzie przerywa bez zmian,
5. zapisuje w kopii dane do wycofania (`update/`): poprzednie wersje nadpisywanych plików, listę plików dodanych,
   identyfikatory działających obrazów (dodatkowo tag `sztudio-core:rollback-…`, `sztudio-web:rollback-…`),
   oraz narzędzia nowej wersji (`tools/`, w tym `rollback.sh`),
6. podmienia pliki kodu; **nigdy nie zmienia** `.env*` (poza `.env.example`), `certs/`, `backups/`, `compose.nas.yml`,
   `docker-compose.override.yml`, `compose.override.yml`. Uprawnienia jak w repozytorium (644, skrypty 755),
   właściciel jak katalogu instalacji,
7. ponownie sprawdza katalog danych bazy w nowej konfiguracji, buduje obrazy, uruchamia `docker compose up -d`,
   czeka do 4 minut na healthchecki i zapisuje `ROLLBACK.txt`.

Gdy cokolwiek zawiedzie **przed** uruchomieniem nowych kontenerów (kontrola, budowanie, podmiana plików), pliki
i tagi obrazów wracają do stanu sprzed aktualizacji, a działające usługi nie są zmieniane.
Pliki usuwane są tylko wtedy, gdy zainstalowało je poprzednie wydanie (manifest `.sztudio-release/files.txt`);
przy pierwszej aktualizacji z 1.0 nic nie jest usuwane.

### Strażnik danych bazy

Skrypty porównują katalog danych faktycznie zamontowany w kontenerze bazy z tym, który wynika z plików Compose.
Jeśli się różnią (np. polecenie bez `compose.nas.yml` podłączyłoby pusty wolumin `db-data` zamiast
`/volume1/Sztudio Smart Home/postgres`), aktualizacja i wycofanie są przerywane **przed jakąkolwiek zmianą**.
Pliki Compose można też wskazać jawnie: `SZTUDIO_COMPOSE_FILES="docker-compose.yml:compose.nas.yml"`.

## Pierwsza aktualizacja (1.0 → 2.0)

Wersja 1.0 nie zawiera skryptów, więc uruchamia się je z rozpakowanego wydania.

1. Pobierz archiwum gałęzi `feature/sztudio-smart-home-2.0` (GitHub → Code → Download ZIP) i skopiuj je do
   `/volume1/Sztudio Smart Home/releases/` i rozpakuj – w menedżerze plików UGOS, jeśli oferuje rozpakowywanie,
   albo na komputerze, a następnie skopiuj cały katalog przez udział sieciowy. Utracone uprawnienia plików
   nie przeszkadzają: skrypty uruchamia się przez `bash`, a `update.sh` ustawia uprawnienia sam.
2. Upewnij się, że ścieżka produkcyjnej bazy jest w `compose.nas.yml`, a nie w zmienionym `docker-compose.yml`
   (aktualizacja zastępuje `docker-compose.yml`; strażnik i tak przerwie, jeśli ścieżka by się zmieniła):

```bash
cd "/volume1/Sztudio Smart Home/repository" && grep -n "postgres" compose.nas.yml
```

3. Podgląd zmian (niczego nie zmienia):

```bash
sudo SZTUDIO_ROOT="/volume1/Sztudio Smart Home/repository" bash "/volume1/Sztudio Smart Home/releases/SztudioSmartHome-feature-sztudio-smart-home-2.0/scripts/update.sh" --from "/volume1/Sztudio Smart Home/releases/SztudioSmartHome-feature-sztudio-smart-home-2.0" --dry-run
```

4. Aktualizacja (pyta o potwierdzenie słowem `AKTUALIZUJ`):

```bash
sudo SZTUDIO_ROOT="/volume1/Sztudio Smart Home/repository" bash "/volume1/Sztudio Smart Home/releases/SztudioSmartHome-feature-sztudio-smart-home-2.0/scripts/update.sh" --from "/volume1/Sztudio Smart Home/releases/SztudioSmartHome-feature-sztudio-smart-home-2.0"
```

Kopie trafią do `SZTUDIO_BACKUP_DIR` – dopisz wcześniej do `.env` linię
`SZTUDIO_BACKUP_DIR=/volume1/Sztudio Smart Home/backups` (bez tego: `repository/backups`).

Etap 0 nie zmienia schematu bazy (pozostaje `0002`).

## Kolejne aktualizacje

```bash
cd "/volume1/Sztudio Smart Home/repository"
```

```bash
sudo bash scripts/update.sh --from "/volume1/Sztudio Smart Home/releases/ARCHIWUM.zip" --dry-run
```

```bash
sudo bash scripts/update.sh --from "/volume1/Sztudio Smart Home/releases/ARCHIWUM.zip"
```

Po aktualizacji: otwórz panel, sprawdź kamery i uruchom `sudo bash scripts/diagnostics.sh`.

## Wycofanie

Polecenie jest w `ROLLBACK.txt` w katalogu kopii utworzonej przy aktualizacji:

```bash
sudo SZTUDIO_ROOT="/volume1/Sztudio Smart Home/repository" bash "/volume1/Sztudio Smart Home/backups/sztudio-RRRRMMDD-GGMMSS/tools/rollback.sh" "/volume1/Sztudio Smart Home/backups/sztudio-RRRRMMDD-GGMMSS"
```

`rollback.sh` (potwierdzenie słowem `WYCOFAJ`):

1. zatrzymuje Core,
2. usuwa pliki dodane przez aktualizację (i puste katalogi po nich), przywraca nadpisane i usunięte,
3. przywraca poprzednie obrazy po identyfikatorze (także obraz panelu `repository-web` z wersji 1.0),
4. jeśli aktualizacja zmieniała migracje – odtwarza bazę z kopii sprzed aktualizacji (`restore.sh`: obecna baza
   zostaje zachowana pod nazwą `sztudio_before_restore_…`); `--with-db` / `--no-db` wymuszają wybór,
5. sprawdza katalog danych bazy i uruchamia poprzednią wersję bez budowania.

Kroki są powtarzalne – po przerwaniu (np. brak miejsca) usuń przyczynę i uruchom to samo polecenie ponownie.
Dane zapisane po aktualizacji nie trafią do bazy odtworzonej z kopii (dotyczy tylko wydań z migracjami).

Kopie sprzed aktualizacji (z katalogiem `update/`) **nie są usuwane przez retencję** – usuń je ręcznie, gdy wycofanie
nie będzie już potrzebne.

## Nigdy

- `docker compose down -v`, `docker volume rm/prune`, `docker system prune --volumes` – usuwają dane bazy.
- Uruchamianie `docker compose up` bez `-f compose.nas.yml`, jeśli produkcja z niego korzysta – Compose podłączy
  wolumin `db-data` i baza wystartuje pusta (dane w `/volume1/…/postgres` pozostaną, ale usługi będą ich nie widzieć).
- Regenerowanie `certs/ca/` – wymaga ponownej instalacji certyfikatu na wszystkich urządzeniach.
- Zmiana `SZTUDIO_SECRET_KEY` – zapisane hasła kamer i rejestratorów stają się nieczytelne.
