#!/bin/sh
# Sztudio Smart Home – automatyczny zrzut bazy PostgreSQL (usługa „backup”, profil Compose „backup”).
#
# Co BACKUP_INTERVAL_HOURS godzin: pg_dump -Fc → weryfikacja pg_restore --list → suma SHA-256 →
# zmiana nazwy z .partial na .dump. Zostawia BACKUP_KEEP najnowszych zrzutów w /backups/auto.
# Usuwa wyłącznie pliki utworzone przez siebie (wzorzec sztudio-RRRRMMDD-GGMMSS.dump).
#
#   --check   kod 0, gdy ostatni udany zrzut jest młodszy niż 2 × odstęp (healthcheck)
set -eu

DIR="${BACKUP_DIR:-/backups/auto}"
INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"
KEEP="${BACKUP_KEEP:-14}"
STATUS="$DIR/.last-success"

case "$INTERVAL_HOURS" in ''|*[!0-9]*) echo "BACKUP_INTERVAL_HOURS musi być liczbą całkowitą" >&2; exit 2;; esac
case "$KEEP" in ''|*[!0-9]*) echo "BACKUP_KEEP musi być liczbą całkowitą" >&2; exit 2;; esac
[ "$INTERVAL_HOURS" -ge 1 ] || { echo "BACKUP_INTERVAL_HOURS musi być ≥ 1" >&2; exit 2; }
[ "$KEEP" -ge 1 ] || { echo "BACKUP_KEEP musi być ≥ 1" >&2; exit 2; }

if [ "${1:-}" = "--check" ]; then
    [ -f "$STATUS" ] || exit 1
    last=$(cat "$STATUS")
    now=$(date +%s)
    [ $((now - last)) -le $((INTERVAL_HOURS * 2 * 3600)) ]
    exit $?
fi

umask 077
mkdir -p "$DIR"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

# Liczba wierszy we wszystkich tabelach schematu public (tylko odczyt).
count_rows() {
    psql -v ON_ERROR_STOP=1 -At -F ' ' -f - <<'SQL'
SELECT format('SELECT %L AS t, count(*) AS n FROM public.%I', tablename, tablename)
 FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename \gexec
SQL
}

backup_once() {
    name="sztudio-$(date +%Y%m%d-%H%M%S)"
    tmp="$DIR/$name.dump.partial"
    counts="$DIR/$name.dump.counts"
    # Liczba wierszy przed i po zrzucie – przy różnicy (zapis w trakcie) zrzut jest powtarzany.
    attempt=1
    while :; do
        if ! count_rows > "$counts.before" || ! pg_dump -Fc -f "$tmp" || ! count_rows > "$counts"; then
            rm -f "$tmp" "$counts" "$counts.before"
            log "BŁĄD: pg_dump albo liczenie wierszy nie powiodło się"
            return 1
        fi
        cmp -s "$counts.before" "$counts" && break
        [ "$attempt" -ge 5 ] && { log "UWAGA: baza zmieniała się w trakcie zrzutu"; break; }
        attempt=$((attempt + 1))
        sleep 2
    done
    rm -f "$counts.before"
    if [ ! -s "$tmp" ] || ! pg_restore --list "$tmp" > /dev/null; then
        rm -f "$tmp" "$counts"
        log "BŁĄD: zrzut jest pusty albo uszkodzony"
        return 1
    fi
    mv "$tmp" "$DIR/$name.dump"
    (cd "$DIR" && sha256sum "$name.dump" "$name.dump.counts" > "$name.dump.sha256")
    date +%s > "$STATUS"
    log "OK: $name.dump ($(wc -c < "$DIR/$name.dump") B)"

    # Retencja: tylko własne pliki, od najstarszych.
    count=$(ls -1 "$DIR" | grep -Ec '^sztudio-[0-9]{8}-[0-9]{6}\.dump$' || true)
    if [ "$count" -gt "$KEEP" ]; then
        ls -1 "$DIR" | grep -E '^sztudio-[0-9]{8}-[0-9]{6}\.dump$' | sort | head -n $((count - KEEP)) |
            while read -r old; do
                rm -f "$DIR/$old" "$DIR/$old.sha256" "$DIR/$old.counts"
                log "Usunięto stary zrzut: $old"
            done
    fi
}

log "Automatyczne kopie bazy: co $INTERVAL_HOURS h, przechowywane $KEEP najnowszych, katalog $DIR"
# Kopia przy starcie (np. po aktualizacji), potem cyklicznie. Błąd nie zatrzymuje usługi – healthcheck go pokaże.
while :; do
    backup_once || true
    sleep $((INTERVAL_HOURS * 3600))
done
