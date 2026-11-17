#!/usr/bin/env bash
# Sztudio Smart Home – pełna kopia zapasowa (uruchamiana na serwerze, w katalogu repozytorium lub dowolnym).
#
# Tworzy katalog  $SZTUDIO_BACKUP_DIR/sztudio-RRRRMMDD-GGMMSS/  zawierający:
#   sztudio.dump      zrzut bazy (pg_dump -Fc) wykonany w działającym kontenerze bazy, zweryfikowany pg_restore --list
#   row-counts.txt    liczba wierszy w tabelach w chwili kopii (do porównania przy weryfikacji)
#   config.tar.gz     konfiguracja – ZAWIERA SEKRETY (pomijana z --no-config):
#                     .env*, wszystkie pliki Compose z katalogu (compose.nas.yml, override…) oraz pliki Compose
#                     faktycznie użyte przez działający stos, docker/ (nginx, go2rtc), certs/ (z kluczami
#                     prywatnymi), VERSION, .sztudio-release/
#   config-files.sha256  suma SHA-256 każdego pliku konfiguracji (kontrola kompletności przy weryfikacji)
#   version.txt       wersja kodu (VERSION; commit Git – tylko jeśli Git jest dostępny, nie jest wymagany)
#   manifest.txt      opis kopii (pliki Compose, katalog danych bazy, PostgreSQL);  SHA256SUMS – sumy kontrolne
# Uprawnienia: katalog 700, pliki 600. Zawartość .env i kluczy nie jest nigdy wypisywana.
#
# Użycie:  scripts/backup.sh [--dir KATALOG] [--keep N] [--no-config] [--label TEKST]
#   --dir      katalog kopii (domyślnie $SZTUDIO_BACKUP_DIR albo ./backups)
#   --keep N   zostaw N najnowszych kopii tego skryptu (domyślnie $SZTUDIO_BACKUP_KEEP albo 14; 0 = bez usuwania);
#              kopie sprzed aktualizacji (punkty wycofania) nie są usuwane automatycznie
#   --label    krótki opis zapisywany w manifeście (np. "przed aktualizacją")
# Zmienne: SZTUDIO_DB_SERVICE (db), SZTUDIO_DB_USER (sztudio), SZTUDIO_DB_NAME (sztudio),
#          SZTUDIO_COMPOSE_FILES (pliki Compose; domyślnie te, z którymi działa stos).
# Pliki .env i certs/ należą zwykle do roota – uruchamiaj przez sudo, jeśli skrypt zgłosi brak dostępu.
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
        -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
        *) die "Nieznany argument: $1 (zob. --help)" ;;
    esac
done
[[ "$KEEP" =~ ^[0-9]+$ ]] || die "--keep musi być liczbą"

# Git nie jest wymagany (nie ma go na NAS-ie).
require_cmd docker tar gzip sha256sum cmp awk sed grep sort
resolve_compose
require_running "$SZTUDIO_DB_SERVICE"
info "Pliki Compose: $(compose_files_description)"

# Lista elementów konfiguracji: ścieżki względne (w repozytorium) i bezwzględne (pliki Compose spoza repozytorium).
CONFIG_REL=()
CONFIG_ABS=()
collect_config() {
    local f a prev=""
    for f in "$SZTUDIO_ROOT"/.env "$SZTUDIO_ROOT"/.env.* "$SZTUDIO_ROOT"/docker-compose*.yml "$SZTUDIO_ROOT"/docker-compose*.yaml \
        "$SZTUDIO_ROOT"/compose*.yml "$SZTUDIO_ROOT"/compose*.yaml "$SZTUDIO_ROOT"/docker "$SZTUDIO_ROOT"/certs \
        "$SZTUDIO_ROOT"/VERSION "$SZTUDIO_ROOT"/.sztudio-release; do
        [ -e "$f" ] && CONFIG_REL+=("${f#"$SZTUDIO_ROOT"/}")
    done
    # Pliki Compose użyte przez stos, leżące poza repozytorium.
    for a in "${COMPOSE_ARGS[@]+"${COMPOSE_ARGS[@]}"}"; do
        if [ "$prev" = "-f" ]; then
            case "$a" in "$SZTUDIO_ROOT"/*) ;; /*) CONFIG_ABS+=("${a#/}") ;; esac
        fi
        prev="$a"
    done
    local required=(.env docker-compose.yml docker/nginx/default.conf.template docker/go2rtc.yaml
        certs/public/server.crt certs/public/server.key)
    local missing=()
    for f in "${required[@]}"; do [ -e "$SZTUDIO_ROOT/$f" ] || missing+=("$f"); done
    [ ${#missing[@]} -eq 0 ] || die "Brak plików konfiguracji: ${missing[*]} – kopia NIE została wykonana."
    [ -e "$SZTUDIO_ROOT/certs/ca/sztudio-ca.key" ] \
        || warn "Brak certs/ca/sztudio-ca.key – zwykłe przy własnym certyfikacie; przy lokalnym CA sprawdź jego położenie."
    # Pliki należące do roota (.env, klucze) muszą być czytelne – inaczej kopia byłaby niekompletna.
    local unreadable
    unreadable="$( (cd "$SZTUDIO_ROOT" && find "${CONFIG_REL[@]}" ! -readable 2> /dev/null) | head -n 5)"
    [ -z "$unreadable" ] || die "Brak uprawnień do odczytu (uruchom przez sudo): $(echo "$unreadable" | tr '\n' ' ')"
}
if [ "$WITH_CONFIG" = 1 ]; then
    collect_config
fi

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
    info "[3/5] Konfiguracja: ${CONFIG_REL[*]} ${CONFIG_ABS[*]:+(spoza repozytorium: ${CONFIG_ABS[*]})}"
    tar_args=(-C "$SZTUDIO_ROOT" "${CONFIG_REL[@]}")
    if [ ${#CONFIG_ABS[@]} -gt 0 ]; then tar_args+=(-C / "${CONFIG_ABS[@]}"); fi
    tar -czf "$WORK/config.tar.gz" "${tar_args[@]}" || die "Archiwizacja konfiguracji nie powiodła się."
    # Suma każdego pliku: weryfikacja sprawdzi, że archiwum zawiera dokładnie te pliki w tej treści.
    { (cd "$SZTUDIO_ROOT" && find "${CONFIG_REL[@]}" -type f -print0 | sort -z | xargs -0 sha256sum)
      if [ ${#CONFIG_ABS[@]} -gt 0 ]; then
          (cd / && find "${CONFIG_ABS[@]}" -type f -print0 | sort -z | xargs -0 sha256sum)
      fi
    } > "$WORK/config-files.sha256" || die "Nie udało się policzyć sum plików konfiguracji."
    tar -tzf "$WORK/config.tar.gz" > /dev/null || die "Archiwum konfiguracji jest nieczytelne."
    info "      $(wc -l < "$WORK/config-files.sha256") plików"
else
    info "[3/5] Konfiguracja pominięta (--no-config)."
fi

info "[4/5] Wersja kodu…"
{
    echo "wersja: $(code_version)"
    # Informacyjnie – tylko gdy Git jest zainstalowany i katalog jest repozytorium.
    if has_git; then
        echo "git: $(git -C "$SZTUDIO_ROOT" rev-parse HEAD 2> /dev/null) ($(git -C "$SZTUDIO_ROOT" rev-parse --abbrev-ref HEAD 2> /dev/null))"
        git -C "$SZTUDIO_ROOT" status --short 2> /dev/null | sed 's/^/  /'
    else
        echo "git: niedostępny (niewymagany)"
    fi
} > "$WORK/version.txt"

{
    echo "Sztudio Smart Home – kopia zapasowa"
    echo "utworzona: $(date -Iseconds)"
    echo "host: $(uname -n)"
    echo "opis: ${LABEL:-–}"
    echo "baza: $SZTUDIO_DB_NAME (usługa $SZTUDIO_DB_SERVICE)"
    echo "dane bazy: $(db_mount_actual)"
    echo "pliki compose: $(compose_files_description)"
    echo "obraz bazy: $(docker inspect -f '{{.Config.Image}}' "$(compose ps -q "$SZTUDIO_DB_SERVICE")")"
    echo "postgres: $(compose exec -T "$SZTUDIO_DB_SERVICE" postgres --version 2> /dev/null | tr -d '\r')"
    echo "konfiguracja: $([ "$WITH_CONFIG" = 1 ] && echo 'tak (zawiera sekrety)' || echo nie)"
} > "$WORK/manifest.txt"

info "[5/5] Sumy kontrolne…"
(cd "$WORK" && sha256_file -- * > SHA256SUMS)
echo "Sztudio Smart Home backup" > "$WORK/$SZTUDIO_BACKUP_MARKER"
chmod 600 "$WORK"/* "$WORK/$SZTUDIO_BACKUP_MARKER"
mv "$WORK" "$TARGET"
chmod 700 "$TARGET"
trap - EXIT

# Retencja – wyłącznie katalogi utworzone przez ten skrypt (wzorzec nazwy + znacznik + sumy).
# Kopie sprzed aktualizacji (z katalogiem update/ – dane do wycofania) nie są usuwane automatycznie.
if [ "$KEEP" -gt 0 ]; then
    mapfile -t ours < <(ls -1 "$SZTUDIO_BACKUP_DIR" | grep -E "$SZTUDIO_BACKUP_PATTERN" | sort \
        | while IFS= read -r n; do [ -d "$SZTUDIO_BACKUP_DIR/$n/update" ] || echo "$n"; done)
    excess=$(( ${#ours[@]} - KEEP ))
    for ((i = 0; i < excess; i++)); do
        old="$SZTUDIO_BACKUP_DIR/${ours[$i]}"
        if [ -f "$old/$SZTUDIO_BACKUP_MARKER" ] && [ -f "$old/manifest.txt" ] && [ -f "$old/SHA256SUMS" ]; then
            rm -rf -- "$old"
            info "Usunięto starą kopię: ${ours[$i]}"
        fi
    done
fi

info ""
info "Gotowe: $TARGET"
if [ "$WITH_CONFIG" = 1 ]; then
    info "config.tar.gz zawiera .env i klucze prywatne – przechowuj kopię wyłącznie w zaufanym miejscu."
fi
info "Weryfikacja odtworzenia (bez wpływu na bazę produkcyjną): scripts/verify-backup.sh \"$TARGET\""
