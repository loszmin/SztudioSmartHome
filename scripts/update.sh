#!/usr/bin/env bash
# Sztudio Smart Home – aktualizacja z kopią zapasową i możliwością wycofania.
#
#   1. kontrola: brak lokalnych zmian w plikach śledzonych, działająca baza, cel aktualizacji istnieje,
#   2. kopia zapasowa (scripts/backup.sh) + jej weryfikacja (scripts/verify-backup.sh),
#   3. oznaczenie obecnych obrazów sztudio-core / sztudio-web tagiem rollback-<commit>,
#   4. git merge --ff-only do wskazanej wersji (bez nadpisywania historii i lokalnych plików),
#   5. docker compose build + up -d, oczekiwanie na healthchecki,
#   6. zapis instrukcji wycofania w katalogu kopii.
# Skrypt nie wykonuje „down -v”, nie usuwa woluminów ani danych.
#
# Użycie:  scripts/update.sh WERSJA [--dry-run]
#   WERSJA – tag, gałąź zdalna lub commit, np.  v2.0.0  albo  origin/feature/sztudio-smart-home-2.0
set -euo pipefail
# Całość w bloku { … exit; }: bash wczytuje blok przed wykonaniem, więc git merge podmieniający ten plik
# w trakcie działania nie zmienia wykonywanego kodu.
{
# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
SCRIPTS="$(dirname "${BASH_SOURCE[0]}")"

TARGET_REF=""
DRY_RUN=0
while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) DRY_RUN=1; shift ;;
        -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
        -*) die "Nieznany argument: $1" ;;
        *) TARGET_REF="$1"; shift ;;
    esac
done
[ -n "$TARGET_REF" ] || die "Podaj wersję docelową (zob. --help)."
require_cmd docker git

cd "$SZTUDIO_ROOT"
info "[1/6] Kontrola wstępna…"
[ -z "$(git status --porcelain --untracked-files=no)" ] \
    || die "Repozytorium ma lokalne zmiany w plikach śledzonych (git status). Zapisz je (np. git stash) albo przenieś do docker-compose.override.yml."
git fetch --tags origin
git rev-parse --verify --quiet "$TARGET_REF^{commit}" > /dev/null || die "Nie znaleziono wersji: $TARGET_REF"
OLD="$(git rev-parse HEAD)"
NEW="$(git rev-parse "$TARGET_REF^{commit}")"
OLD_SHORT="$(git rev-parse --short HEAD)"
[ "$OLD" != "$NEW" ] || { info "Repozytorium jest już w wersji $TARGET_REF ($OLD_SHORT)."; exit 0; }
git merge-base --is-ancestor "$OLD" "$NEW" \
    || die "$TARGET_REF nie jest kontynuacją obecnej wersji ($OLD_SHORT) – aktualizacja przewijaniem niemożliwa. Wykonaj ją ręcznie."
require_running "$SZTUDIO_DB_SERVICE"

info "      $OLD_SHORT → $(git rev-parse --short "$NEW") ($TARGET_REF)"
info "      Zmiany:"
git log --oneline "$OLD..$NEW" | sed 's/^/        /'
if git diff --name-only "$OLD" "$NEW" | grep -q '^core/alembic/versions/'; then
    info "      UWAGA: wersja zawiera migracje bazy danych – wycofanie może wymagać odtworzenia kopii."
fi
if [ "$DRY_RUN" = 1 ]; then
    info "Tryb --dry-run: nic nie zostało zmienione."
    exit 0
fi

info "[2/6] Kopia zapasowa…"
backup_out="$("$SCRIPTS/backup.sh" --label "przed aktualizacją $OLD_SHORT → $TARGET_REF")" || die "Kopia nie powiodła się – aktualizacja przerwana bez zmian."
printf '%s\n' "$backup_out" | sed 's/^/      /'
BACKUP_PATH="$(latest_backup_dir)"
"$SCRIPTS/verify-backup.sh" "$BACKUP_PATH" | sed 's/^/      /' \
    || die "Weryfikacja kopii nie powiodła się – aktualizacja przerwana bez zmian."

info "[3/6] Oznaczanie obecnych obrazów do wycofania…"
for img in sztudio-core sztudio-web; do
    if docker image inspect "$img:local" > /dev/null 2>&1; then
        docker tag "$img:local" "$img:rollback-$OLD_SHORT"
        info "      $img:local → $img:rollback-$OLD_SHORT"
    else
        warn "Brak obrazu $img:local – nie będzie można go wycofać tagiem (wymagane ponowne zbudowanie starej wersji)."
    fi
done

info "[4/6] Aktualizacja kodu (git merge --ff-only)…"
git merge --ff-only "$NEW"
# Kopia narzędzi nowej wersji obok kopii zapasowej – po wycofaniu kodu do starszej wersji skryptów
# odtwarzania może nie być w repozytorium.
mkdir -p "$BACKUP_PATH/tools"
cp -R "$SZTUDIO_ROOT/scripts/." "$BACKUP_PATH/tools/"

info "[5/6] Budowanie i uruchamianie…"
compose build
compose up -d

ok=0
for _ in $(seq 1 90); do
    bad=""
    for id in $(compose ps -q); do
        st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")"
        svc="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$id")"
        case "$svc:$st" in
            *:healthy|*:running|certs:exited) ;;
            *) bad="$bad $svc=$st" ;;
        esac
    done
    if [ -z "$bad" ]; then ok=1; break; fi
    sleep 2
done

ROLLBACK="$BACKUP_PATH/ROLLBACK.txt"
cat > "$ROLLBACK" <<EOF
Wycofanie aktualizacji $OLD_SHORT → $TARGET_REF (wykonanej $(date -Iseconds))
Kopia sprzed aktualizacji: $BACKUP_PATH

cd "$SZTUDIO_ROOT"
docker compose stop core
git reset --keep $OLD
docker tag sztudio-core:rollback-$OLD_SHORT sztudio-core:local
docker tag sztudio-web:rollback-$OLD_SHORT sztudio-web:local

# Tylko gdy aktualizacja zawierała migracje bazy (wtedy stara wersja Core nie uruchomi się na nowym schemacie):
SZTUDIO_ROOT="$SZTUDIO_ROOT" "$BACKUP_PATH/tools/restore.sh" "$BACKUP_PATH"

docker compose up -d --no-build
EOF
chmod 600 "$ROLLBACK"

info "[6/6] Instrukcja wycofania: $ROLLBACK"
if [ "$ok" = 1 ]; then
    info "Aktualizacja zakończona – wszystkie usługi zdrowe. Sprawdź panel i uruchom scripts/diagnostics.sh."
else
    warn "Nie wszystkie usługi są zdrowe:$bad"
    warn "Sprawdź: docker compose ps, docker compose logs <usługa>. Wycofanie: $ROLLBACK"
    exit 1
fi
exit 0
}
