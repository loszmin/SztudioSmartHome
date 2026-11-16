#!/usr/bin/env bash
# Sztudio Smart Home – odtworzenie bazy danych z kopii BEZ usuwania obecnej bazy.
#
# Przebieg:
#   1. sprawdzenie sum kontrolnych kopii,
#   2. nowa kopia zapasowa obecnego stanu (scripts/backup.sh),
#   3. zatrzymanie Core (i usługi backup, jeśli działa),
#   4. odtworzenie zrzutu do NOWEJ bazy  sztudio_restore_<czas>,
#   5. zamiana nazw: obecna baza → sztudio_before_restore_<czas>, odtworzona → sztudio,
#   6. uruchomienie Core i oczekiwanie na healthcheck.
# Poprzednia baza zostaje na serwerze pod nową nazwą – można do niej wrócić (docs/kopie-zapasowe.md).
# Konfiguracja (.env, certs/) NIE jest odtwarzana automatycznie – zob. dokumentację.
#
# Usługi zatrzymane przed uruchomieniem skryptu pozostają zatrzymane.
#
# Użycie:  scripts/restore.sh KATALOG_KOPII|PLIK.dump [--yes]
#   --yes  bez pytania o potwierdzenie (do automatyzacji testów)
set -euo pipefail
# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

SRC=""
ASSUME_YES=0
while [ $# -gt 0 ]; do
    case "$1" in
        --yes) ASSUME_YES=1; shift ;;
        -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
        -*) die "Nieznany argument: $1" ;;
        *) SRC="$1"; shift ;;
    esac
done
[ -n "$SRC" ] || die "Podaj katalog kopii albo plik .dump (zob. --help)."
if [ -d "$SRC" ]; then DUMP="$SRC/sztudio.dump"; else DUMP="$SRC"; fi
[ -s "$DUMP" ] || die "Brak pliku zrzutu albo jest pusty: $DUMP"
DUMP="$(cd "$(dirname "$DUMP")" && pwd)/$(basename "$DUMP")"

require_cmd docker
require_running "$SZTUDIO_DB_SERVICE"

if [ -d "$SRC" ] && [ -f "$SRC/SHA256SUMS" ]; then
    (cd "$SRC" && sha256_file -c --quiet SHA256SUMS) || die "Sumy kontrolne kopii niezgodne – przerywam."
    info "[ok] Sumy kontrolne kopii zgodne"
fi

TS="$(date +%Y%m%d_%H%M%S)"
NEW_DB="${SZTUDIO_DB_NAME}_restore_${TS}"
OLD_DB="${SZTUDIO_DB_NAME}_before_restore_${TS}"

info ""
info "Odtworzenie bazy '$SZTUDIO_DB_NAME' z: $DUMP"
info "Obecna baza zostanie zachowana jako '$OLD_DB'. Core będzie niedostępny przez czas operacji."
if [ "$ASSUME_YES" != 1 ]; then
    read -r -p "Wpisz PRZYWRÓĆ, aby kontynuować: " answer
    [ "$answer" = "PRZYWRÓĆ" ] || die "Przerwano – nic nie zostało zmienione."
fi

psql_admin() {
    compose exec -T "$SZTUDIO_DB_SERVICE" psql -U "$SZTUDIO_DB_USER" -d postgres -v ON_ERROR_STOP=1 -At "$@"
}

info "[1/5] Kopia obecnego stanu przed odtworzeniem…"
"$(dirname "${BASH_SOURCE[0]}")/backup.sh" --keep 0 --label "automatycznie przed odtworzeniem z $(basename "$SRC")" \
    || die "Kopia przed odtworzeniem nie powiodła się – przerywam bez zmian."

info "[2/5] Odtwarzanie do nowej bazy '$NEW_DB'…"
psql_admin -c "CREATE DATABASE \"$NEW_DB\" OWNER \"$SZTUDIO_DB_USER\"" > /dev/null
if ! compose exec -T "$SZTUDIO_DB_SERVICE" pg_restore -U "$SZTUDIO_DB_USER" -d "$NEW_DB" --no-owner --no-privileges \
    --exit-on-error < "$DUMP"; then
    # Usuwana jest wyłącznie baza utworzona przed chwilą przez ten skrypt; dane produkcyjne bez zmian.
    psql_admin -c "DROP DATABASE IF EXISTS \"$NEW_DB\"" > /dev/null || true
    die "pg_restore nie powiódł się – obecna baza pozostała bez zmian."
fi

STOPPED=()
STOPPED_IDS=()
info "[3/5] Zatrzymywanie usług korzystających z bazy…"
for svc in core backup; do
    id="$(compose ps -q "$svc" 2> /dev/null || true)"
    # Także kontener w pętli restartów (np. stara wersja Core przy nowszym schemacie bazy).
    if [ -n "$id" ] && [ "$(docker inspect -f '{{or .State.Running .State.Restarting}}' "$id")" = "true" ]; then
        docker stop "$id" > /dev/null
        STOPPED+=("$svc")
        STOPPED_IDS+=("$id")
    fi
done

info "[4/5] Zamiana baz…"
psql_admin <<SQL > /dev/null
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$SZTUDIO_DB_NAME' AND pid <> pg_backend_pid();
ALTER DATABASE "$SZTUDIO_DB_NAME" RENAME TO "$OLD_DB";
ALTER DATABASE "$NEW_DB" RENAME TO "$SZTUDIO_DB_NAME";
SQL

info "[5/5] Uruchamianie usług: ${STOPPED[*]:-brak}"
if [ ${#STOPPED_IDS[@]} -gt 0 ]; then
    docker start "${STOPPED_IDS[@]}" > /dev/null
fi
if [[ " ${STOPPED[*]:-} " == *" core "* ]]; then
    for _ in $(seq 1 60); do
        state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${STOPPED_IDS[0]}")"
        [ "$state" = "healthy" ] && break
        sleep 2
    done
    info "Core: $state"
fi

info ""
info "Odtworzono. Poprzednia baza: '$OLD_DB' (nie została usunięta)."
info "Powrót do niej i usunięcie zbędnej bazy – docs/kopie-zapasowe.md, sekcja: Odtworzenie bazy."
