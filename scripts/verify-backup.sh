#!/usr/bin/env bash
# Sztudio Smart Home – nieniszcząca weryfikacja kopii zapasowej.
#
# Odtwarza zrzut bazy w TYMCZASOWYM kontenerze PostgreSQL bez sieci (dane w tmpfs), liczy wiersze
# w tabelach i porównuje je z liczbami zapisanymi w chwili kopii. Kontener jest usuwany po teście.
# Produkcyjna baza danych nie jest używana ani modyfikowana.
#
# Użycie:  scripts/verify-backup.sh [KATALOG_KOPII | PLIK.dump]
#   bez argumentu – najnowsza kopia w $SZTUDIO_BACKUP_DIR (albo ./backups)
# Kod wyjścia 0 tylko przy poprawnej kopii.
# Zmienne: SZTUDIO_VERIFY_IMAGE (domyślnie obraz usługi bazy z kopii albo postgres:16-alpine)
set -euo pipefail
# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

case "${1:-}" in -h|--help) sed -n '2,11p' "$0"; exit 0 ;; esac
require_cmd docker

SRC="${1:-$(latest_backup_dir)}"
[ -n "$SRC" ] || die "Nie znaleziono kopii w $SZTUDIO_BACKUP_DIR. Podaj katalog kopii albo plik .dump."
if [ -d "$SRC" ]; then
    DIR="$SRC"
    DUMP="$SRC/sztudio.dump"
    COUNTS_FILE="$SRC/row-counts.txt"
else
    DIR=""
    DUMP="$SRC"
    COUNTS_FILE="$SRC.counts"   # zrzut automatyczny (usługa backup)
fi
[ -s "$DUMP" ] || die "Brak pliku zrzutu albo jest pusty: $DUMP"

FAIL=0
info "Weryfikacja: $DUMP"

if [ -n "$DIR" ] && [ -f "$DIR/SHA256SUMS" ]; then
    if (cd "$DIR" && sha256_file -c --quiet SHA256SUMS); then
        info "[ok] Sumy SHA-256 zgodne"
    else
        info "[BŁĄD] Sumy SHA-256 niezgodne – kopia jest uszkodzona"
        FAIL=1
    fi
elif [ -f "$DUMP.sha256" ]; then
    if (cd "$(dirname "$DUMP")" && sha256_file -c --quiet "$(basename "$DUMP").sha256"); then
        info "[ok] Suma SHA-256 zgodna"
    else
        info "[BŁĄD] Suma SHA-256 niezgodna"
        FAIL=1
    fi
else
    warn "Brak sum kontrolnych – pomijam ich sprawdzenie."
fi

IMAGE="${SZTUDIO_VERIFY_IMAGE:-}"
if [ -z "$IMAGE" ] && [ -n "$DIR" ] && [ -f "$DIR/manifest.txt" ]; then
    IMAGE="$(sed -n 's/^obraz bazy: //p' "$DIR/manifest.txt")"
fi
IMAGE="${IMAGE:-postgres:16-alpine}"

NAME="sztudio-verify-$$-$RANDOM"
# Losowe hasło tylko dla tymczasowego kontenera bez sieci; nie jest nigdzie zapisywane.
PW="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
cleanup() { docker rm -f "$NAME" > /dev/null 2>&1 || true; }
trap cleanup EXIT

info "Tymczasowy kontener: $IMAGE (bez sieci, dane w pamięci)"
docker run -d --name "$NAME" --network none --tmpfs /var/lib/postgresql/data:rw,size=2g \
    -e POSTGRES_PASSWORD="$PW" -e POSTGRES_USER=verify -e POSTGRES_DB=verify "$IMAGE" > /dev/null

ready=0
for _ in $(seq 1 60); do
    # Obraz uruchamia serwer dwukrotnie (inicjalizacja, potem właściwy) – czekamy na stabilny stan.
    if docker exec "$NAME" pg_isready -U verify -d verify -h 127.0.0.1 > /dev/null 2>&1 \
        && docker exec "$NAME" psql -U verify -d verify -h 127.0.0.1 -Atc 'SELECT 1' > /dev/null 2>&1; then
        ready=1
        break
    fi
    sleep 1
done
[ "$ready" = 1 ] || die "Tymczasowy PostgreSQL nie wystartował."

if docker exec -i "$NAME" pg_restore -U verify -d verify -h 127.0.0.1 --no-owner --no-privileges --exit-on-error < "$DUMP"; then
    info "[ok] Zrzut odtworzony bez błędów"
else
    info "[BŁĄD] pg_restore zakończył się błędem"
    exit 1
fi

COUNTS="$(printf '%s\n' "$ROW_COUNT_SQL" | docker exec -i "$NAME" psql -U verify -d verify -h 127.0.0.1 -v ON_ERROR_STOP=1 -At -F ' ' -f -)"
VERSION="$(docker exec "$NAME" psql -U verify -d verify -h 127.0.0.1 -Atc 'SELECT version_num FROM alembic_version' 2> /dev/null || echo brak)"
info "Wersja schematu (Alembic): $VERSION"
info ""
printf '%-28s %12s %12s\n' "tabela" "odtworzono" "w kopii"
while read -r table n; do
    [ -n "$table" ] || continue
    expected="–"
    if [ -f "$COUNTS_FILE" ]; then
        expected="$(awk -v t="$table" '$1 == t { print $2 }' "$COUNTS_FILE")"
        expected="${expected:-brak}"
        [ "$expected" = "$n" ] || FAIL=1
    fi
    printf '%-28s %12s %12s\n' "$table" "$n" "$expected"
done <<< "$COUNTS"

if [ -f "$COUNTS_FILE" ]; then
    while read -r table _; do
        grep -q "^$table " <<< "$COUNTS" || { info "[BŁĄD] Brak tabeli po odtworzeniu: $table"; FAIL=1; }
    done < "$COUNTS_FILE"
else
    warn "Brak liczby wierszy z chwili kopii – porównanie pominięte."
fi

# Zrzut bez schematu Sztudio (np. wykonany przed migracjami) nie nadaje się do odtworzenia instalacji.
if [ "$VERSION" = "brak" ] || [ -z "$VERSION" ]; then
    info "[BŁĄD] Zrzut nie zawiera schematu Sztudio (brak tabeli alembic_version)"
    FAIL=1
fi
if ! grep -q '^users ' <<< "$COUNTS"; then
    info "[BŁĄD] Zrzut nie zawiera tabeli users"
    FAIL=1
fi

if [ -n "$DIR" ] && [ -f "$DIR/config.tar.gz" ]; then
    if tar -tzf "$DIR/config.tar.gz" > /dev/null; then
        info "[ok] Archiwum konfiguracji czytelne ($(tar -tzf "$DIR/config.tar.gz" | wc -l) elementów)"
    else
        info "[BŁĄD] Archiwum konfiguracji uszkodzone"
        FAIL=1
    fi
fi

info ""
if [ "$FAIL" = 0 ]; then
    info "WYNIK: kopia poprawna – zrzut odtwarza się, liczby wierszy zgodne."
else
    info "WYNIK: kopia NIEPOPRAWNA – zob. pozycje [BŁĄD] powyżej."
    exit 1
fi
