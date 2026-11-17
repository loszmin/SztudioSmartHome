#!/usr/bin/env bash
# Sztudio Smart Home – wycofanie aktualizacji wykonanej przez scripts/update.sh.
#
# Uruchamiany z kopii narzędzi w katalogu kopii zapasowej (polecenie jest w ROLLBACK.txt):
#   sudo SZTUDIO_ROOT="/volume1/Sztudio Smart Home/repository" bash "KOPIA/tools/rollback.sh" "KOPIA"
#
#   1. zatrzymanie Core (i usługi backup),
#   2. przywrócenie plików kodu: usunięcie plików dodanych przez aktualizację, odtworzenie nadpisanych i usuniętych,
#   3. przywrócenie poprzednich obrazów Docker (po identyfikatorze obrazu),
#   4. odtworzenie bazy z kopii sprzed aktualizacji – gdy aktualizacja zmieniała migracje
#      (restore.sh: obecna baza zostaje zachowana pod inną nazwą),
#   5. kontrola katalogu danych bazy w przywróconej konfiguracji Compose, uruchomienie bez budowania.
# Pliki chronione (.env*, certs/, backups/, compose.nas.yml, override) nie są zmieniane.
#
# Użycie:  rollback.sh KATALOG_KOPII [--with-db | --no-db] [--yes]
set -euo pipefail
# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SRC=""
DB_MODE="auto"
ASSUME_YES=0
while [ $# -gt 0 ]; do
    case "$1" in
        --with-db) DB_MODE="yes"; shift ;;
        --no-db) DB_MODE="no"; shift ;;
        --yes) ASSUME_YES=1; shift ;;
        -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
        -*) die "Nieznany argument: $1" ;;
        *) SRC="$1"; shift ;;
    esac
done
[ -n "$SRC" ] || die "Podaj katalog kopii utworzonej przez update.sh (zob. --help)."
SRC="$(cd "$SRC" && pwd)"
U="$SRC/update"
for f in info.txt code-before.tar.gz added-files.txt images.txt; do
    [ -f "$U/$f" ] || die "To nie jest kopia utworzona przez update.sh (brak update/$f)."
done
[ -f "$SZTUDIO_ROOT/docker-compose.yml" ] || die "SZTUDIO_ROOT nie wskazuje instalacji Sztudio: $SZTUDIO_ROOT"
require_cmd docker tar gzip sha256sum
resolve_compose

MIGRATIONS="$(sed -n 's/^migracje: //p' "$U/info.txt")"
case "$DB_MODE" in
    auto) WITH_DB="$MIGRATIONS" ;;
    yes) WITH_DB=1 ;;
    no) WITH_DB=0 ;;
esac

info "Wycofanie: $(sed -n 's/^z: //p' "$U/info.txt") ← $(sed -n 's/^do: //p' "$U/info.txt")"
info "Instalacja: $SZTUDIO_ROOT"
info "Pliki Compose: $(compose_files_description)"
info "Kod: usunięcie $(wc -l < "$U/added-files.txt") dodanych plików, przywrócenie $(tar -tzf "$U/code-before.tar.gz" | grep -vc '/$' || true) plików"
info "Baza: $([ "$WITH_DB" = 1 ] && echo "odtworzenie z $SRC (obecna zostanie zachowana pod inną nazwą)" || echo "bez zmian")"
if [ "$ASSUME_YES" != 1 ]; then
    read -r -p "Wpisz WYCOFAJ, aby kontynuować: " answer
    [ "$answer" = "WYCOFAJ" ] || die "Przerwano – nic nie zostało zmienione."
fi
if [ "$WITH_DB" = 1 ]; then
    (cd "$SRC" && sha256_file -c --quiet SHA256SUMS) || die "Sumy kontrolne kopii niezgodne – przerywam bez zmian."
fi

DONE=0
# shellcheck disable=SC2329  # wywoływana z pułapki EXIT
on_exit() {
    local rc=$?
    if [ "$DONE" != 1 ] && [ "$rc" != 0 ]; then
        warn "Wycofanie przerwane. Usuń przyczynę błędu i uruchom ponownie to samo polecenie – kroki są powtarzalne."
    fi
    exit "$rc"
}
trap on_exit EXIT
info "[1/5] Zatrzymywanie Core…"
for svc in core backup; do
    id="$(compose ps -aq "$svc" 2> /dev/null | head -n 1 || true)"
    if [ -n "$id" ]; then docker stop "$id" > /dev/null; fi
done

info "[2/5] Przywracanie plików kodu…"
remove_listed_files "$U/added-files.txt"
tar -xzf "$U/code-before.tar.gz" -C "$SZTUDIO_ROOT" --no-same-owner
rm -rf -- "$SZTUDIO_ROOT/.sztudio-release"
if [ -f "$U/release-manifest-before.tar.gz" ]; then
    tar -xzf "$U/release-manifest-before.tar.gz" -C "$SZTUDIO_ROOT" --no-same-owner
fi
if [ "$(id -u)" = 0 ]; then
    tar -tzf "$U/code-before.tar.gz" | while IFS= read -r p; do
        chown -h --reference="$SZTUDIO_ROOT" "$SZTUDIO_ROOT/$p" 2> /dev/null || true
    done
fi

info "[3/5] Przywracanie obrazów…"
restore_image_tags "$U/images.txt"

if [ "$WITH_DB" = 1 ]; then
    info "[4/5] Odtwarzanie bazy z kopii sprzed aktualizacji…"
    bash "$SCRIPTS/restore.sh" "$SRC" --yes
else
    info "[4/5] Baza bez zmian (aktualizacja nie zmieniała migracji)."
fi

info "[5/5] Uruchamianie poprzedniej wersji…"
check_db_mount
compose up -d --no-build
DONE=1
if wait_healthy 240; then
    info ""
    info "Wycofano – wszystkie usługi zdrowe. Wersja: $(code_version)"
else
    warn "Nie wszystkie usługi są zdrowe:$BAD_SERVICES – sprawdź docker compose ps / logs."
    exit 1
fi
