# shellcheck shell=bash disable=SC2034  # zmienne są używane przez skrypty dołączające ten plik
# Wspólne funkcje skryptów operacyjnych Sztudio Smart Home. Plik jest dołączany (source), nie uruchamiany.
#
# Zasady:
#  - skrypty nigdy nie wypisują zawartości .env ani kluczy prywatnych,
#  - wszystkie ścieżki są cytowane (katalogi na NAS-ie zawierają spacje),
#  - Git NIE jest wymagany (na NAS-ie nie jest zainstalowany) – używany tylko informacyjnie, gdy jest,
#  - polecenia Compose używają TYCH SAMYCH plików Compose co działający stos (odczyt z etykiet kontenerów),
#    dzięki czemu np. compose.nas.yml z produkcyjną ścieżką bazy nie zostanie pominięty.

# SZTUDIO_ROOT można podać jawnie – np. przy uruchamianiu kopii narzędzi z katalogu kopii zapasowej.
SZTUDIO_ROOT="${SZTUDIO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
SZTUDIO_DB_SERVICE="${SZTUDIO_DB_SERVICE:-db}"
SZTUDIO_DB_USER="${SZTUDIO_DB_USER:-sztudio}"
SZTUDIO_DB_NAME="${SZTUDIO_DB_NAME:-sztudio}"
SZTUDIO_DB_DATA_PATH="/var/lib/postgresql/data"
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
# Skrypty wywoływane przez inne skrypty (backup.sh z update.sh, restore.sh z rollback.sh) działają na tej samej instalacji.
export SZTUDIO_ROOT SZTUDIO_BACKUP_DIR
# Kopie tworzone przez backup.sh: nazwa wg wzorca + plik znacznika. Tylko takie katalogi podlegają retencji.
SZTUDIO_BACKUP_PATTERN='^sztudio-[0-9]{8}-[0-9]{6}$'
SZTUDIO_BACKUP_MARKER=".sztudio-backup"

# Pliki i katalogi chronione: nigdy nie są nadpisywane ani usuwane przy aktualizacji kodu.
SZTUDIO_PROTECTED_RE='^(\.env|\.env\..*|certs(/.*)?|backups(/.*)?|compose\.nas\.yml|docker-compose\.override\.yml|compose\.override\.yml|\.sztudio-release(/.*)?|\.git(/.*)?|node_modules(/.*)?|core/\.venv(/.*)?)$'

# Filtr listy ścieżek: usuwa pliki chronione (.env.example jest zwykłym plikiem wydania).
not_protected() { awk -v re="$SZTUDIO_PROTECTED_RE" '$0 == ".env.example" || $0 !~ re'; }

info() { printf '%s\n' "$*"; }
warn() { printf 'UWAGA: %s\n' "$*" >&2; }
die() { printf 'BŁĄD: %s\n' "$*" >&2; exit 1; }

require_cmd() {
    local c missing=()
    for c in "$@"; do
        command -v "$c" > /dev/null 2>&1 || missing+=("$c")
    done
    [ ${#missing[@]} -eq 0 ] || die "Brak wymaganych poleceń: ${missing[*]}"
}

has_git() {
    command -v git > /dev/null 2>&1 && git -C "$SZTUDIO_ROOT" rev-parse --git-dir > /dev/null 2>&1
}

# Wersja kodu: plik VERSION (zawsze) + commit, jeśli katalog jest repozytorium Git i Git jest dostępny.
code_version() {
    local v="nieznana"
    [ -r "$SZTUDIO_ROOT/VERSION" ] && v="$(head -n 1 "$SZTUDIO_ROOT/VERSION")"
    if [ -r "$SZTUDIO_ROOT/.sztudio-release/installed.txt" ]; then
        v="$v ($(sed -n 's/^zainstalowano: //p' "$SZTUDIO_ROOT/.sztudio-release/installed.txt"))"
    fi
    if has_git; then
        v="$v, git $(git -C "$SZTUDIO_ROOT" rev-parse --short HEAD 2> /dev/null || echo '?')"
    fi
    printf '%s\n' "$v"
}

# ---------- Docker Compose ----------

COMPOSE_BIN=()
COMPOSE_ARGS=()
COMPOSE_SOURCE=""

_compose_bin() {
    [ ${#COMPOSE_BIN[@]} -gt 0 ] && return 0
    if docker compose version > /dev/null 2>&1; then
        COMPOSE_BIN=(docker compose)
    elif command -v docker-compose > /dev/null 2>&1; then
        COMPOSE_BIN=(docker-compose)
    else
        die "Nie znaleziono 'docker compose' ani 'docker-compose'."
    fi
}

# Ustala pliki Compose. Kolejność:
#  1. SZTUDIO_COMPOSE_FILES – lista rozdzielona dwukropkami (ścieżki względem repozytorium lub bezwzględne),
#  2. etykiety działającego kontenera bazy z tego katalogu: dokładnie te pliki i ta nazwa projektu, z którymi
#     stos został uruchomiony (np. docker-compose.yml + compose.nas.yml),
#  3. compose.nas.yml obok docker-compose.yml (+ docker-compose.override.yml, jeśli jest),
#  4. domyślne zachowanie Compose (docker-compose.yml + docker-compose.override.yml, COMPOSE_FILE z .env).
resolve_compose() {
    [ -n "$COMPOSE_SOURCE" ] && return 0
    # Compose odczytuje .env (należy zwykle do roota) – bez dostępu każde polecenie Compose zawiedzie.
    if [ -e "$SZTUDIO_ROOT/.env" ] && [ ! -r "$SZTUDIO_ROOT/.env" ]; then
        die "Brak uprawnień do odczytu $SZTUDIO_ROOT/.env – uruchom skrypt przez sudo."
    fi
    _compose_bin
    COMPOSE_ARGS=()
    local f files project id wd root_phys
    if [ -n "${SZTUDIO_COMPOSE_FILES:-}" ]; then
        IFS=':' read -r -a files <<< "$SZTUDIO_COMPOSE_FILES"
        for f in "${files[@]}"; do
            case "$f" in /*) ;; *) f="$SZTUDIO_ROOT/$f" ;; esac
            [ -f "$f" ] || die "SZTUDIO_COMPOSE_FILES: brak pliku $f"
            COMPOSE_ARGS+=(-f "$f")
        done
        COMPOSE_SOURCE="SZTUDIO_COMPOSE_FILES"
        return 0
    fi
    root_phys="$(cd "$SZTUDIO_ROOT" && pwd -P)"
    for id in $(docker ps -aq --filter "label=com.docker.compose.service=$SZTUDIO_DB_SERVICE" 2> /dev/null); do
        wd="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$id")"
        [ -n "$wd" ] && [ -d "$wd" ] || continue
        [ "$(cd "$wd" && pwd -P)" = "$root_phys" ] || continue
        project="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$id")"
        IFS=',' read -r -a files <<< "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$id")"
        local ok=1
        for f in "${files[@]}"; do [ -f "$f" ] || ok=0; done
        if [ "$ok" = 1 ] && [ ${#files[@]} -gt 0 ]; then
            COMPOSE_ARGS=(-p "$project")
            for f in "${files[@]}"; do COMPOSE_ARGS+=(-f "$f"); done
            COMPOSE_SOURCE="etykiety działającego stosu (projekt $project)"
            return 0
        fi
        warn "Stos był uruchomiony z plików, których już nie ma: ${files[*]}"
    done
    if [ -f "$SZTUDIO_ROOT/compose.nas.yml" ]; then
        COMPOSE_ARGS=(-f "$SZTUDIO_ROOT/docker-compose.yml" -f "$SZTUDIO_ROOT/compose.nas.yml")
        [ -f "$SZTUDIO_ROOT/docker-compose.override.yml" ] && COMPOSE_ARGS+=(-f "$SZTUDIO_ROOT/docker-compose.override.yml")
        COMPOSE_SOURCE="compose.nas.yml (stos nie działa – brak etykiet)"
        return 0
    fi
    COMPOSE_SOURCE="domyślne pliki Compose"
}

compose() {
    resolve_compose
    (cd "$SZTUDIO_ROOT" && "${COMPOSE_BIN[@]}" "${COMPOSE_ARGS[@]+"${COMPOSE_ARGS[@]}"}" "$@")
}

compose_files_description() {
    resolve_compose
    local out="" a prev=""
    for a in "${COMPOSE_ARGS[@]+"${COMPOSE_ARGS[@]}"}"; do
        [ "$prev" = "-f" ] && out="$out ${a#"$SZTUDIO_ROOT"/}"
        prev="$a"
    done
    printf '%s:%s\n' "$COMPOSE_SOURCE" "${out:- docker-compose.yml (+ override, COMPOSE_FILE)}"
}

# Kontener usługi musi działać (polecenia exec).
require_running() {
    local id err
    err="$(mktemp)"
    id="$(compose ps -q "$1" 2> "$err" || true)"
    if [ -z "$id" ]; then
        [ -s "$err" ] && warn "docker compose: $(head -n 3 "$err" | redact)"
        rm -f "$err"
        die "Usługa '$1' nie działa albo nie można jej odczytać (docker compose ps)."
    fi
    rm -f "$err"
    [ "$(docker inspect -f '{{.State.Running}}' "$id")" = "true" ] || die "Kontener usługi '$1' nie jest uruchomiony."
}

# ---------- Strażnik danych bazy ----------
# Wynik: "bind|/ścieżka/na/hoście" albo "volume|nazwa_woluminu".

# Faktyczne montowanie katalogu danych w kontenerze bazy (działającym lub zatrzymanym).
db_mount_actual() {
    local id
    id="$(compose ps -aq "$SZTUDIO_DB_SERVICE" 2> /dev/null | head -n 1 || true)"
    [ -n "$id" ] || return 0
    docker inspect -f '{{range .Mounts}}{{if eq .Destination "'"$SZTUDIO_DB_DATA_PATH"'"}}{{.Type}}|{{if eq .Type "volume"}}{{.Name}}{{else}}{{.Source}}{{end}}{{end}}{{end}}' "$id"
}

# Montowanie wynikające z bieżących plików Compose. Wynik `compose config` zawiera sekrety –
# jest wyłącznie przetwarzany przez awk, nigdy wypisywany.
db_mount_expected() {
    compose config 2> /dev/null | awk -v svc="$SZTUDIO_DB_SERVICE" -v target="$SZTUDIO_DB_DATA_PATH" '
        /^services:/ { in_services = 1; next }
        /^[a-z]/ && !/^services:/ { in_services = 0; section = $1 }
        in_services && /^  [^ ]/ { cur = $1; sub(":", "", cur); in_vol = 0 }
        in_services && cur == svc && /^    volumes:/ { in_vol = 1; next }
        in_services && cur == svc && /^    [^ -]/ && !/^    volumes:/ { in_vol = 0 }
        in_vol && /^      - type:/ { type = $3; src = "" ; tgt = "" }
        in_vol && /^        source:/ { src = $0; sub(/^        source: /, "", src); gsub(/^"|"$/, "", src) }
        in_vol && /^        target:/ { tgt = $2; if (tgt == target) { found_type = type; found_src = src } }
        section == "volumes:" && /^  [^ ]/ { vol = $1; sub(":", "", vol) }
        section == "volumes:" && /^    name:/ { n = $0; sub(/^    name: /, "", n); gsub(/^"|"$/, "", n); names[vol] = n }
        END {
            if (found_type == "") exit
            if (found_type == "volume") print "volume|" (found_src in names ? names[found_src] : found_src)
            else print found_type "|" found_src
        }'
}

# Przerywa, jeśli bieżące pliki Compose zamontowałyby inny katalog danych bazy niż ten, na którym baza działa.
# Chroni przed uruchomieniem PostgreSQL na pustym woluminie (np. db-data zamiast /volume1/…/postgres).
check_db_mount() {
    local actual expected
    actual="$(db_mount_actual)"
    expected="$(db_mount_expected)"
    [ -n "$expected" ] || die "Nie można ustalić katalogu danych bazy z plików Compose ($(compose_files_description))."
    if [ -z "$actual" ]; then
        warn "Brak kontenera bazy – nie można porównać montowania danych. Oczekiwane: ${expected#*|}"
        return 0
    fi
    if [ "$actual" != "$expected" ]; then
        die "Dane bazy: działający kontener używa '${actual#*|}' (${actual%%|*}), a pliki Compose wskazują '${expected#*|}' (${expected%%|*}).
       Uruchomienie z tą konfiguracją podłączyłoby inny (np. pusty) katalog bazy. Przerywam bez zmian.
       Pliki Compose: $(compose_files_description)"
    fi
    info "[ok] Dane bazy: ${actual#*|} (${actual%%|*}) – zgodne z plikami Compose"
}

# ---------- Pomocnicze ----------

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

# Usuwa pliki z listy (ścieżki względne w instalacji) i pozostawione przez nie PUSTE katalogi.
remove_listed_files() {
    local p d
    while IFS= read -r p; do
        [ -n "$p" ] || continue
        rm -f -- "$SZTUDIO_ROOT/$p"
        d="$(dirname "$SZTUDIO_ROOT/$p")"
        while [ "$d" != "$SZTUDIO_ROOT" ] && rmdir -- "$d" 2> /dev/null; do d="$(dirname "$d")"; done
    done < "$1"
}

# Przywraca tagi obrazów zapisane przez update.sh (linie "usługa|nazwa|id obrazu").
restore_image_tags() {
    local svc name image_id
    while IFS='|' read -r svc name image_id; do
        [ -n "$svc" ] || continue
        docker tag "$image_id" "$name" \
            || die "Brak obrazu $image_id ($svc) – został usunięty. Zbuduj poprzednią wersję: docker compose build"
        info "      $svc: $name ← ${image_id:7:12}"
    done < "$1"
}

# Najnowszy katalog kopii utworzony przez backup.sh (pusta wartość, gdy brak).
latest_backup_dir() {
    [ -d "$SZTUDIO_BACKUP_DIR" ] || return 0
    local name
    name="$(ls -1 "$SZTUDIO_BACKUP_DIR" | grep -E "$SZTUDIO_BACKUP_PATTERN" | sort | tail -n 1 || true)"
    [ -n "$name" ] && printf '%s\n' "$SZTUDIO_BACKUP_DIR/$name"
    return 0
}

# Czeka, aż wszystkie usługi stosu będą zdrowe (usługi bez healthchecka – uruchomione; certs – zakończony).
# Zwraca 0 albo 1; w BAD_SERVICES zostawia listę problemów.
BAD_SERVICES=""
wait_healthy() {
    local timeout="${1:-180}" id st svc start
    start=$(date +%s)
    while :; do
        BAD_SERVICES=""
        for id in $(compose ps -aq); do
            # stan|zdrowie|kod wyjścia – zdrowie liczy się tylko dla działających kontenerów
            st="$(docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.State.ExitCode}}' "$id")"
            svc="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$id")"
            case "$st" in
                running\|healthy\|*|running\|\|*) ;;
                exited\|*\|0) [ "$svc" = "certs" ] || BAD_SERVICES="$BAD_SERVICES $svc=exited" ;;
                running\|*) BAD_SERVICES="$BAD_SERVICES $svc=$(cut -d'|' -f2 <<< "$st")" ;;
                *) BAD_SERVICES="$BAD_SERVICES $svc=$(cut -d'|' -f1 <<< "$st")" ;;
            esac
        done
        [ -z "$BAD_SERVICES" ] && return 0
        [ $(( $(date +%s) - start )) -ge "$timeout" ] && return 1
        sleep 3
    done
}

# shellcheck disable=SC2034  # używana w skryptach dołączających ten plik
# Lista „tabela liczba_wierszy” dla wszystkich tabel schematu public (zapytanie tylko do odczytu).
ROW_COUNT_SQL="SELECT format('SELECT %L AS t, count(*) AS n FROM public.%I', tablename, tablename)
 FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename \\gexec"
