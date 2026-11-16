#!/usr/bin/env bash
# Sztudio Smart Home – pełna kopia zapasowa (uruchamiana na serwerze, w katalogu repozytorium lub dowolnym).
#
# Tworzy katalog  $SZTUDIO_BACKUP_DIR/sztudio-RRRRMMDD-GGMMSS/  zawierający:
#   sztudio.dump      zrzut bazy (pg_dump -Fc) wykonany w działającym kontenerze bazy, zweryfikowany pg_restore --list
#   row-counts.txt    liczba wierszy w tabelach w chwili kopii (do porównania przy weryfikacji)
#   config.tar.gz     .env, certs/ (z kluczem CA) i pliki Compose – ZAWIERA SEKRETY (pomijane z --no-config)
#   git.txt           commit, gałąź i lista lokalnych zmian;  git-local-changes.diff – zmiany w plikach śledzonych
#   manifest.txt      opis kopii;  SHA256SUMS – sumy kontrolne
# Uprawnienia: katalog 700, pliki 600. Zawartość .env i kluczy nie jest nigdy wypisywana.
#
# Użycie:  scripts/backup.sh [--dir KATALOG] [--keep N] [--no-config] [--label TEKST]
#   --dir      katalog kopii (domyślnie $SZTUDIO_BACKUP_DIR albo ./backups)
#   --keep N   zostaw N najnowszych kopii tego skryptu (domyślnie $SZTUDIO_BACKUP_KEEP albo 14; 0 = bez usuwania)
#   --label    krótki opis zapisywany w manifeście (np. "przed aktualizacją")
# Zmienne: SZTUDIO_DB_SERVICE (db), SZTUDIO_DB_USER (sztudio), SZTUDIO_DB_NAME (sztudio).
set -euo pipefail
# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

KEEP="${SZTUDIO_BACKUP_KEEP:-14}"
WITH_CONFIG=1
LABEL=""
while [ $# -gt 0 ]; do
    case "$1" in
        --dir) SZTUDIO_BACKUP_DIR="${2:?--dir wymaga ścieżki}"; shift 2 ;;
        --keep) KEEP="${2:?--keep wymaga liczby}"; shift 2 ;;
        --no-config) WITH_CONFIG=0; shift ;;
        --label) LABEL="${2:-}"; shift 2 ;;
        -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
        *) die "Nieznany argument: $1 (zob. --help)" ;;
    esac
done
[[ "$KEEP" =~ ^[0-9]+$ ]] || die "--keep musi być liczbą"

require_cmd docker tar git
require_running "$SZTUDIO_DB_SERVICE"

umask 077
mkdir -p "$SZTUDIO_BACKUP_DIR"
chmod 700 "$SZTUDIO_BACKUP_DIR" 2> /dev/null || warn "Nie można ustawić uprawnień 700 na $SZTUDIO_BACKUP_DIR"

NAME="sztudio-$(date +%Y%m%d-%H%M%S)"
TARGET="$SZTUDIO_BACKUP_DIR/$NAME"
WORK="$SZTUDIO_BACKUP_DIR/.$NAME.partial"
[ ! -e "$TARGET" ] || die "Katalog już istnieje: $TARGET"
mkdir "$WORK"
cleanup() { [ -d "$WORK" ] && rm -rf -- "$WORK"; }
trap cleanup EXIT

info "Kopia zapasowa Sztudio Smart Home → $TARGET"

# 1. Baza danych – zrzut w formacie custom (spójny, bez zatrzymywania usług).
# Liczba wierszy jest liczona przed i po zrzucie; różnica (zapis w trakcie) powoduje powtórzenie,
# żeby zapisane liczby odpowiadały dokładnie zawartości zrzutu.
count_rows() {
    printf '%s\n' "$ROW_COUNT_SQL" | compose exec -T "$SZTUDIO_DB_SERVICE" \
        psql -U "$SZTUDIO_DB_USER" -d "$SZTUDIO_DB_NAME" -v ON_ERROR_STOP=1 -At -F ' ' -f - > "$1" \
        || die "Nie udało się policzyć wierszy."
}
consistent=0
for attempt in 1 2 3 4 5; do
    info "[1/5] Zrzut bazy '$SZTUDIO_DB_NAME' (próba $attempt)…"
    count_rows "$WORK/row-counts.before"
    compose exec -T "$SZTUDIO_DB_SERVICE" pg_dump -U "$SZTUDIO_DB_USER" -d "$SZTUDIO_DB_NAME" -Fc > "$WORK/sztudio.dump" \
        || die "pg_dump nie powiódł się – kopia NIE została wykonana."
    count_rows "$WORK/row-counts.txt"
    if cmp -s "$WORK/row-counts.before" "$WORK/row-counts.txt"; then
        consistent=1
        break
    fi
    sleep 2
done
rm -f "$WORK/row-counts.before"
[ "$consistent" = 1 ] || warn "Baza zmieniała się w trakcie każdej próby – liczby wierszy mogą nieznacznie różnić się od zrzutu."
[ -s "$WORK/sztudio.dump" ] || die "Zrzut bazy jest pusty – kopia NIE została wykonana."
compose exec -T "$SZTUDIO_DB_SERVICE" pg_restore --list < "$WORK/sztudio.dump" > "$WORK/dump-contents.txt" \
    || die "Zrzut nie daje się odczytać (pg_restore --list) – kopia NIE została wykonana."
info "[2/5] Zrzut czytelny: $(grep -c 'TABLE DATA' "$WORK/dump-contents.txt" || true) tabel z danymi, $(wc -c < "$WORK/sztudio.dump") B"
grep -q '^alembic_version ' "$WORK/row-counts.txt" \
    || warn "Baza nie zawiera tabeli alembic_version – czy Core wykonał migracje?"

# 2. Konfiguracja – archiwizowana bez wyświetlania zawartości.
if [ "$WITH_CONFIG" = 1 ]; then
    info "[3/5] Konfiguracja (.env, certs/, pliki Compose)…"
    items=()
    for f in .env certs docker-compose.yml docker-compose.override.yml compose.yml compose.override.yml; do
        [ -e "$SZTUDIO_ROOT/$f" ] && items+=("$f")
    done
    [ -e "$SZTUDIO_ROOT/.env" ] || warn "Brak pliku .env – nie trafi do kopii."
    [ -e "$SZTUDIO_ROOT/certs/ca/sztudio-ca.key" ] || warn "Brak certs/ca/sztudio-ca.key (własny certyfikat albo inna lokalizacja)."
    tar -C "$SZTUDIO_ROOT" -czf "$WORK/config.tar.gz" "${items[@]}" || die "Archiwizacja konfiguracji nie powiodła się."
    info "      $(tar -tzf "$WORK/config.tar.gz" | wc -l) elementów"
else
    info "[3/5] Konfiguracja pominięta (--no-config)."
fi

info "[4/5] Stan repozytorium…"
{
    echo "commit: $(git -C "$SZTUDIO_ROOT" rev-parse HEAD 2> /dev/null || echo nieznany)"
    echo "branch: $(git -C "$SZTUDIO_ROOT" rev-parse --abbrev-ref HEAD 2> /dev/null || echo nieznana)"
    echo "status:"
    git -C "$SZTUDIO_ROOT" status --short 2> /dev/null || true
} > "$WORK/git.txt"
git -C "$SZTUDIO_ROOT" diff > "$WORK/git-local-changes.diff" 2> /dev/null || true

{
    echo "Sztudio Smart Home – kopia zapasowa"
    echo "utworzona: $(date -Iseconds)"
    echo "host: $(hostname)"
    echo "opis: ${LABEL:-–}"
    echo "baza: $SZTUDIO_DB_NAME (usługa $SZTUDIO_DB_SERVICE)"
    echo "obraz bazy: $(docker inspect -f '{{.Config.Image}}' "$(compose ps -q "$SZTUDIO_DB_SERVICE")")"
    echo "postgres: $(compose exec -T "$SZTUDIO_DB_SERVICE" postgres --version 2> /dev/null | tr -d '\r')"
    echo "konfiguracja: $([ "$WITH_CONFIG" = 1 ] && echo 'tak (zawiera sekrety)' || echo nie)"
} > "$WORK/manifest.txt"

info "[5/5] Sumy kontrolne…"
(cd "$WORK" && sha256_file -- * > SHA256SUMS)
chmod 600 "$WORK"/*
mv "$WORK" "$TARGET"
chmod 700 "$TARGET"
trap - EXIT

# Retencja – wyłącznie katalogi utworzone przez ten skrypt (wzorzec nazwy + manifest).
if [ "$KEEP" -gt 0 ]; then
    mapfile -t ours < <(ls -1 "$SZTUDIO_BACKUP_DIR" | grep -E "$SZTUDIO_BACKUP_PATTERN" | sort)
    excess=$(( ${#ours[@]} - KEEP ))
    for ((i = 0; i < excess; i++)); do
        old="$SZTUDIO_BACKUP_DIR/${ours[$i]}"
        if [ -f "$old/manifest.txt" ] && [ -f "$old/SHA256SUMS" ]; then
            rm -rf -- "$old"
            info "Usunięto starą kopię: ${ours[$i]}"
        fi
    done
fi

info ""
info "Gotowe: $TARGET"
[ "$WITH_CONFIG" = 1 ] && info "config.tar.gz zawiera .env i klucz prywatny CA – przechowuj kopię wyłącznie w zaufanym miejscu."
info "Weryfikacja odtworzenia (bez wpływu na bazę produkcyjną): scripts/verify-backup.sh \"$TARGET\""
