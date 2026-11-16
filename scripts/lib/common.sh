# shellcheck shell=bash
# Wspólne funkcje skryptów operacyjnych Sztudio Smart Home. Plik jest dołączany (source), nie uruchamiany.
#
# Zasady: skrypty nigdy nie wypisują zawartości .env ani kluczy prywatnych, wszystkie ścieżki są
# cytowane (katalogi na NAS-ie zawierają spacje), a polecenia Compose działają w katalogu repozytorium
# – dzięki temu uwzględniają lokalny docker-compose.override.yml oraz zmienne COMPOSE_FILE / COMPOSE_PROJECT_NAME.

# SZTUDIO_ROOT można podać jawnie – np. przy uruchamianiu kopii narzędzi z katalogu kopii zapasowej.
SZTUDIO_ROOT="${SZTUDIO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
SZTUDIO_DB_SERVICE="${SZTUDIO_DB_SERVICE:-db}"
SZTUDIO_DB_USER="${SZTUDIO_DB_USER:-sztudio}"
SZTUDIO_DB_NAME="${SZTUDIO_DB_NAME:-sztudio}"
# Katalog kopii: zmienna środowiskowa, a gdy jej brak – wyłącznie klucz SZTUDIO_BACKUP_DIR z .env
# (ten sam, którego używa usługa „backup” w Compose). Inne wartości z .env nie są odczytywane.
if [ -z "${SZTUDIO_BACKUP_DIR:-}" ] && [ -r "$SZTUDIO_ROOT/.env" ]; then
    SZTUDIO_BACKUP_DIR="$(sed -n 's/^[[:space:]]*SZTUDIO_BACKUP_DIR[[:space:]]*=[[:space:]]*//p' "$SZTUDIO_ROOT/.env" | tail -n 1)"
    SZTUDIO_BACKUP_DIR="${SZTUDIO_BACKUP_DIR%\"}"; SZTUDIO_BACKUP_DIR="${SZTUDIO_BACKUP_DIR#\"}"
    SZTUDIO_BACKUP_DIR="${SZTUDIO_BACKUP_DIR%\'}"; SZTUDIO_BACKUP_DIR="${SZTUDIO_BACKUP_DIR#\'}"
fi
SZTUDIO_BACKUP_DIR="${SZTUDIO_BACKUP_DIR:-./backups}"
# Ścieżka względna – względem katalogu repozytorium (tak samo jak w Compose).
case "$SZTUDIO_BACKUP_DIR" in /*) ;; *) SZTUDIO_BACKUP_DIR="$SZTUDIO_ROOT/${SZTUDIO_BACKUP_DIR#./}" ;; esac
# Nazwa katalogu kopii tworzonej przez backup.sh; tylko takie katalogi podlegają retencji.
SZTUDIO_BACKUP_PATTERN='^sztudio-[0-9]{8}-[0-9]{6}$'

info() { printf '%s\n' "$*"; }
warn() { printf 'UWAGA: %s\n' "$*" >&2; }
die() { printf 'BŁĄD: %s\n' "$*" >&2; exit 1; }

# docker compose (v2) albo docker-compose (v1).
compose() {
    if docker compose version > /dev/null 2>&1; then
        (cd "$SZTUDIO_ROOT" && docker compose "$@")
    elif command -v docker-compose > /dev/null 2>&1; then
        (cd "$SZTUDIO_ROOT" && docker-compose "$@")
    else
        die "Nie znaleziono 'docker compose' ani 'docker-compose'."
    fi
}

require_cmd() {
    local c
    for c in "$@"; do
        command -v "$c" > /dev/null 2>&1 || die "Brak polecenia: $c"
    done
}

# Kontener usługi musi działać (polecenia exec).
require_running() {
    local id
    id="$(compose ps -q "$1" 2> /dev/null || true)"
    [ -n "$id" ] || die "Usługa '$1' nie działa (docker compose ps). Uruchom stos: docker compose up -d"
    [ "$(docker inspect -f '{{.State.Running}}' "$id")" = "true" ] || die "Kontener usługi '$1' nie jest uruchomiony."
}

# Maskowanie sekretów w tekście (logi, wyniki poleceń) – filtr strumieniowy.
redact() {
    sed -E \
        -e 's#([a-zA-Z][a-zA-Z0-9+.-]*://)[^/@[:space:]"]+@#\1***@#g' \
        -e 's/((token|password|passwd|pass|secret|key|pwd)=)[^&[:space:]"]+/\1***/Ig' \
        -e 's/("(password|secret|token|accessToken|access_token)"[[:space:]]*:[[:space:]]*")[^"]*"/\1***"/Ig' \
        -e 's/(Authorization:[[:space:]]*)[^[:space:]]+([[:space:]]+[^[:space:]]+)?/\1***/Ig' \
        -e 's/(Bearer[[:space:]]+)[A-Za-z0-9._~+\/=-]+/\1***/g'
}

sha256_file() {
    if command -v sha256sum > /dev/null 2>&1; then
        sha256sum "$@"
    else
        shasum -a 256 "$@"
    fi
}

# Najnowszy katalog kopii utworzony przez backup.sh (pusta wartość, gdy brak).
latest_backup_dir() {
    [ -d "$SZTUDIO_BACKUP_DIR" ] || return 0
    local name
    name="$(ls -1 "$SZTUDIO_BACKUP_DIR" | grep -E "$SZTUDIO_BACKUP_PATTERN" | sort | tail -n 1 || true)"
    [ -n "$name" ] && printf '%s\n' "$SZTUDIO_BACKUP_DIR/$name"
    return 0
}

# shellcheck disable=SC2034  # używana w skryptach dołączających ten plik
# Lista „tabela liczba_wierszy” dla wszystkich tabel schematu public (zapytanie tylko do odczytu).
ROW_COUNT_SQL="SELECT format('SELECT %L AS t, count(*) AS n FROM public.%I', tablename, tablename)
 FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename \\gexec"
