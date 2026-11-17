#!/usr/bin/env bash
# Sztudio Smart Home – aktualizacja z archiwum wydania (bez Gita), z kopią zapasową i możliwością wycofania.
#
#   1. rozpakowanie wydania (katalog, .tar.gz/.tgz albo .zip – np. „Download ZIP” z GitHuba) i jego kontrola,
#   2. porównanie z zainstalowanym kodem: pliki nowe, zmienione, usunięte w nowej wersji; wykrycie migracji bazy,
#   3. kopia zapasowa (scripts/backup.sh) + weryfikacja (scripts/verify-backup.sh),
#   4. zapis do kopii: poprzednie wersje nadpisywanych plików, lista plików dodanych, obrazy Docker do wycofania,
#      narzędzia nowej wersji (w tym rollback.sh),
#   5. podmiana plików kodu (pliki chronione nigdy nie są ruszane: .env*, certs/, backups/, compose.nas.yml,
#      docker-compose.override.yml, compose.override.yml),
#   6. kontrola, że nowa konfiguracja Compose montuje TEN SAM katalog danych bazy (inaczej: cofnięcie plików),
#   7. docker compose build + up -d, oczekiwanie na healthchecki, ROLLBACK.txt.
# Skrypt nie wykonuje „down -v”, nie usuwa woluminów, nie zmienia .env ani certyfikatów.
#
# Użycie:  scripts/update.sh --from WYDANIE [--dry-run] [--yes]
#   Pierwsza aktualizacja z 1.0 (w repozytorium nie ma jeszcze skryptów) – uruchom skrypt z rozpakowanego wydania:
#     sudo SZTUDIO_ROOT="/volume1/Sztudio Smart Home/repository" bash "KATALOG_WYDANIA/scripts/update.sh" --from "KATALOG_WYDANIA"
set -euo pipefail
# Całość w bloku { … exit; }: bash wczytuje blok przed wykonaniem, więc podmiana tego pliku
# w trakcie aktualizacji nie zmienia wykonywanego kodu.
{
# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SRC=""
DRY_RUN=0
ASSUME_YES=0
while [ $# -gt 0 ]; do
    case "$1" in
        --from) SRC="${2:?--from wymaga ścieżki}"; shift 2 ;;
        --dry-run) DRY_RUN=1; shift ;;
        --yes) ASSUME_YES=1; shift ;;
        -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
        *) die "Nieznany argument: $1 (zob. --help)" ;;
    esac
done
[ -n "$SRC" ] || die "Podaj wydanie: --from KATALOG|ARCHIWUM (zob. --help)."
require_cmd docker tar gzip sha256sum cmp find sort comm awk sed grep
resolve_compose
[ -f "$SZTUDIO_ROOT/docker-compose.yml" ] && [ -d "$SZTUDIO_ROOT/core" ] \
    || die "SZTUDIO_ROOT nie wskazuje instalacji Sztudio: $SZTUDIO_ROOT"

TMP=""
# shellcheck disable=SC2329  # wywoływana z pułapki EXIT
cleanup() { if [ -n "$TMP" ] && [ -d "$TMP" ]; then rm -rf -- "$TMP"; fi; }
trap cleanup EXIT

# ---------- 1. Wydanie ----------
extract_zip() {
    if command -v unzip > /dev/null 2>&1; then
        unzip -q "$1" -d "$2"
    elif command -v python3 > /dev/null 2>&1; then
        python3 -m zipfile -e "$1" "$2"
    else
        # Bez unzip i Pythona: busybox unzip z obrazu bazy (obraz jest już na serwerze), bez sieci.
        local img
        img="$(docker inspect -f '{{.Config.Image}}' "$(compose ps -q "$SZTUDIO_DB_SERVICE")")"
        docker run --rm --network none -v "$(cd "$(dirname "$1")" && pwd)/$(basename "$1"):/in.zip:ro" \
            -v "$2:/out" --entrypoint unzip "$img" -q /in.zip -d /out
    fi
}

if [ -d "$SRC" ]; then
    REL="$(cd "$SRC" && pwd)"
else
    [ -f "$SRC" ] || die "Nie ma takiego pliku ani katalogu: $SRC"
    mkdir -p "$SZTUDIO_BACKUP_DIR"
    TMP="$(mktemp -d "$SZTUDIO_BACKUP_DIR/.update-XXXXXX")"
    case "$SRC" in
        *.tar.gz|*.tgz) tar -xzf "$SRC" -C "$TMP" --no-same-owner ;;
        *.zip) extract_zip "$SRC" "$TMP" ;;
        *) die "Nieobsługiwany format archiwum: $SRC (.tar.gz, .tgz, .zip)" ;;
    esac
    REL="$TMP"
    # Archiwum z GitHuba ma jeden katalog nadrzędny.
    if [ ! -f "$REL/docker-compose.yml" ]; then
        mapfile -t top < <(find "$REL" -mindepth 1 -maxdepth 1)
        [ ${#top[@]} -eq 1 ] && [ -d "${top[0]}" ] && REL="${top[0]}"
    fi
fi
for f in docker-compose.yml VERSION scripts/update.sh scripts/rollback.sh core/Dockerfile core/alembic/versions; do
    [ -e "$REL/$f" ] || die "To nie jest wydanie Sztudio Smart Home 2.0 (brak $f w $REL)."
done
[ "$(cd "$REL" && pwd -P)" != "$(cd "$SZTUDIO_ROOT" && pwd -P)" ] \
    || die "Wydanie i instalacja to ten sam katalog. Ustaw SZTUDIO_ROOT na katalog instalacji (zob. --help)."

NEW_VERSION="$(head -n 1 "$REL/VERSION")"
OLD_VERSION="$(code_version)"
SRC_SUM=""
if [ -f "$SRC" ]; then SRC_SUM="$(sha256sum "$SRC" | cut -c1-64)"; fi

# ---------- 2. Porównanie ----------
LISTS="$(mktemp -d)"
# Przy przerwaniu w trakcie podmiany plików (przed uruchomieniem nowych kontenerów) kod jest cofany.
APPLYING=0
# shellcheck disable=SC2329  # wywoływana z pułapki EXIT
on_exit() {
    local rc=$?
    if [ "$APPLYING" = 1 ] && [ "$rc" != 0 ]; then
        revert_code || warn "Cofnięcie plików nie powiodło się – użyj rollback.sh z katalogu kopii."
    fi
    cleanup
    rm -rf -- "$LISTS"
    exit "$rc"
}
trap on_exit EXIT
(cd "$REL" && find . \( -type f -o -type l \) -print | sed 's#^\./##' | not_protected | sort) > "$LISTS/release"
: > "$LISTS/added"
: > "$LISTS/changed"
while IFS= read -r p; do
    if [ ! -e "$SZTUDIO_ROOT/$p" ] && [ ! -L "$SZTUDIO_ROOT/$p" ]; then
        echo "$p" >> "$LISTS/added"
    elif ! cmp -s "$REL/$p" "$SZTUDIO_ROOT/$p"; then
        echo "$p" >> "$LISTS/changed"
    fi
done < "$LISTS/release"
# Pliki usunięte w nowej wersji – wyłącznie te, które zainstalowało poprzednie wydanie (manifest).
# Bez manifestu (pierwsza aktualizacja z 1.0) nic nie jest usuwane: katalog może zawierać pliki użytkownika.
PREV_MANIFEST="$SZTUDIO_ROOT/.sztudio-release/files.txt"
if [ -f "$PREV_MANIFEST" ]; then
    sort "$PREV_MANIFEST" | comm -23 - "$LISTS/release" | not_protected \
        | while IFS= read -r p; do [ -e "$SZTUDIO_ROOT/$p" ] && echo "$p"; done > "$LISTS/removed" || true
else
    : > "$LISTS/removed"
fi
MIGRATIONS=0
if cat "$LISTS/added" "$LISTS/changed" "$LISTS/removed" | grep -q '^core/alembic/versions/'; then MIGRATIONS=1; fi

info "Instalacja: $SZTUDIO_ROOT"
info "Wersja: $OLD_VERSION → $NEW_VERSION"
info "Wydanie: $SRC${SRC_SUM:+ (sha256 $SRC_SUM)}"
info "Pliki: $(wc -l < "$LISTS/added") nowych, $(wc -l < "$LISTS/changed") zmienionych, $(wc -l < "$LISTS/removed") do usunięcia"
for kind in added changed removed; do
    case "$kind" in added) label="nowy" ;; changed) label="zmieniony" ;; removed) label="usuwany" ;; esac
    head -n 40 "$LISTS/$kind" | sed "s/^/  $label: /"
    [ "$(wc -l < "$LISTS/$kind")" -le 40 ] || info "  … oraz $(( $(wc -l < "$LISTS/$kind") - 40 )) innych ($label)"
done
[ -f "$PREV_MANIFEST" ] || info "  (brak manifestu poprzedniego wydania – żadne pliki nie zostaną usunięte)"
[ "$MIGRATIONS" = 1 ] && info "UWAGA: wydanie zmienia migracje bazy – wycofanie będzie wymagało odtworzenia bazy z kopii."
if [ ! -s "$LISTS/added" ] && [ ! -s "$LISTS/changed" ] && [ ! -s "$LISTS/removed" ]; then
    info "Kod jest identyczny z wydaniem – nic do zrobienia."
    exit 0
fi
if [ "$DRY_RUN" = 1 ]; then
    info "Tryb --dry-run: nic nie zostało zmienione."
    exit 0
fi

require_running "$SZTUDIO_DB_SERVICE"
info "Pliki Compose: $(compose_files_description)"
check_db_mount
if [ "$ASSUME_YES" != 1 ]; then
    read -r -p "Wpisz AKTUALIZUJ, aby kontynuować: " answer
    [ "$answer" = "AKTUALIZUJ" ] || die "Przerwano – nic nie zostało zmienione."
fi

# ---------- 3. Kopia ----------
info "[1/6] Kopia zapasowa i jej weryfikacja…"
if ! bash "$SCRIPTS/backup.sh" --label "przed aktualizacją do $NEW_VERSION" | sed 's/^/      /'; then
    die "Kopia nie powiodła się – aktualizacja przerwana bez zmian."
fi
BACKUP_PATH="$(latest_backup_dir)"
if ! bash "$SCRIPTS/verify-backup.sh" "$BACKUP_PATH" | sed 's/^/      /'; then
    die "Weryfikacja kopii nie powiodła się – aktualizacja przerwana bez zmian."
fi

# ---------- 4. Dane do wycofania ----------
info "[2/6] Zapis danych do wycofania: $BACKUP_PATH/update"
U="$BACKUP_PATH/update"
mkdir -p "$U"
cat "$LISTS/changed" "$LISTS/removed" | tr '\n' '\0' > "$LISTS/before.nul"
tar -czf "$U/code-before.tar.gz" -C "$SZTUDIO_ROOT" --verbatim-files-from --null -T "$LISTS/before.nul"
cp "$LISTS/added" "$U/added-files.txt"
cp "$LISTS/changed" "$U/changed-files.txt"
cp "$LISTS/removed" "$U/removed-files.txt"
if [ -d "$SZTUDIO_ROOT/.sztudio-release" ]; then
    tar -czf "$U/release-manifest-before.tar.gz" -C "$SZTUDIO_ROOT" .sztudio-release
fi
TS="${BACKUP_PATH##*/sztudio-}"
: > "$U/images.txt"
for svc in core web; do
    id="$(compose ps -q "$svc" 2> /dev/null | head -n 1 || true)"
    [ -n "$id" ] || { warn "Usługa $svc nie działa – jej obraz nie zostanie zapamiętany do wycofania."; continue; }
    name="$(docker inspect -f '{{.Config.Image}}' "$id")"
    image_id="$(docker inspect -f '{{.Image}}' "$id")"
    # Dodatkowy tag chroni obraz przed usunięciem przy czyszczeniu nieużywanych obrazów.
    docker tag "$image_id" "sztudio-$svc:rollback-$TS"
    printf '%s|%s|%s\n' "$svc" "$name" "$image_id" >> "$U/images.txt"
    info "      obraz $svc: $name → sztudio-$svc:rollback-$TS"
done
{
    echo "z: $OLD_VERSION"
    echo "do: $NEW_VERSION"
    echo "wydanie: $SRC"
    echo "sha256 wydania: ${SRC_SUM:-– (katalog)}"
    echo "migracje: $MIGRATIONS"
    echo "data: $(date -Iseconds)"
} > "$U/info.txt"
mkdir -p "$BACKUP_PATH/tools"
cp -R "$REL/scripts/." "$BACKUP_PATH/tools/"
chmod -R go-rwx "$U" "$BACKUP_PATH/tools"

# ---------- 5. Podmiana plików ----------
# shellcheck disable=SC2329  # wywoływana z pułapki EXIT (on_exit)
revert_code() {
    warn "Cofam pliki kodu do stanu sprzed aktualizacji…"
    remove_listed_files "$U/added-files.txt"
    tar -xzf "$U/code-before.tar.gz" -C "$SZTUDIO_ROOT" --no-same-owner
    rm -rf -- "$SZTUDIO_ROOT/.sztudio-release"
    if [ -f "$U/release-manifest-before.tar.gz" ]; then
        tar -xzf "$U/release-manifest-before.tar.gz" -C "$SZTUDIO_ROOT" --no-same-owner
    fi
    # Częściowo udane budowanie mogło już przestawić tagi :local na obrazy nowej wersji.
    restore_image_tags "$U/images.txt"
}
info "[3/6] Podmiana plików kodu…"
APPLYING=1
cat "$LISTS/added" "$LISTS/changed" | tr '\n' '\0' > "$LISTS/apply.nul"
tar -cf - -C "$REL" --verbatim-files-from --null -T "$LISTS/apply.nul" | tar -xf - -C "$SZTUDIO_ROOT" --no-same-owner
remove_listed_files "$LISTS/removed"
# Uprawnienia jak w repozytorium (archiwa .zip bywają rozpakowywane z 600 i bez bitu wykonywania):
# 644, skrypty (#!) 755. Pliki trafiają do obrazów – Core działa jako użytkownik nieuprzywilejowany.
while IFS= read -r p; do
    f="$SZTUDIO_ROOT/$p"
    [ -f "$f" ] && [ ! -L "$f" ] || continue
    if [ "$(head -c 2 "$f")" = "#!" ]; then chmod 755 "$f"; else chmod 644 "$f"; fi
done < <(cat "$LISTS/added" "$LISTS/changed")
while IFS= read -r p; do
    d="$(dirname "$SZTUDIO_ROOT/$p")"
    while [ "$d" != "$SZTUDIO_ROOT" ]; do chmod 755 "$d"; d="$(dirname "$d")"; done
done < "$LISTS/added"
# Uruchomienie przez sudo: nowe pliki należą do właściciela katalogu instalacji, nie do roota.
if [ "$(id -u)" = 0 ]; then
    while IFS= read -r p; do
        d="$SZTUDIO_ROOT/$p"
        while [ "$d" != "$SZTUDIO_ROOT" ]; do chown -h --reference="$SZTUDIO_ROOT" "$d" 2> /dev/null || true; d="$(dirname "$d")"; done
    done < <(cat "$LISTS/added" "$LISTS/changed")
fi
mkdir -p "$SZTUDIO_ROOT/.sztudio-release"
cp "$LISTS/release" "$SZTUDIO_ROOT/.sztudio-release/files.txt"
{
    echo "wersja: $NEW_VERSION"
    echo "zainstalowano: $NEW_VERSION $(date +%Y-%m-%d)"
    echo "wydanie: $SRC"
    echo "sha256 wydania: ${SRC_SUM:-– (katalog)}"
} > "$SZTUDIO_ROOT/.sztudio-release/installed.txt"

# ---------- 6. Kontrola danych bazy w nowej konfiguracji ----------
info "[4/6] Kontrola konfiguracji Compose nowej wersji…"
if ! (check_db_mount); then
    die "Nowa konfiguracja Compose wskazuje inny katalog danych bazy – pliki przywrócone, usługi nie były zmieniane.
       Produkcyjną ścieżkę bazy trzymaj w compose.nas.yml (docs/aktualizacja-i-wycofanie.md)."
fi

# ---------- 7. Budowanie i uruchomienie ----------
info "[5/6] Budowanie obrazów…"
if ! compose build; then
    die "Budowanie nie powiodło się – pliki przywrócone, działające usługi nie były zmieniane."
fi

ROLLBACK="$BACKUP_PATH/ROLLBACK.txt"
cat > "$ROLLBACK" <<EOF
Wycofanie aktualizacji $OLD_VERSION → $NEW_VERSION (wykonanej $(date -Iseconds))
Kopia sprzed aktualizacji: $BACKUP_PATH
Migracje bazy w aktualizacji: $([ "$MIGRATIONS" = 1 ] && echo "TAK – baza zostanie odtworzona z kopii" || echo nie)

Wycofanie (kod, obrazy$([ "$MIGRATIONS" = 1 ] && echo ", baza") i ponowne uruchomienie):
sudo SZTUDIO_ROOT="$SZTUDIO_ROOT" bash "$BACKUP_PATH/tools/rollback.sh" "$BACKUP_PATH"
EOF
chmod 600 "$ROLLBACK"

info "[6/6] Uruchamianie…"
# Od tej chwili zmieniają się kontenery – wycofanie wyłącznie przez rollback.sh (ROLLBACK.txt).
APPLYING=0
compose up -d
if wait_healthy 240; then
    info ""
    info "Aktualizacja do $NEW_VERSION zakończona – wszystkie usługi zdrowe."
    info "Wycofanie w razie potrzeby: $ROLLBACK"
    info "Sprawdź panel i uruchom scripts/diagnostics.sh."
else
    warn "Nie wszystkie usługi są zdrowe:$BAD_SERVICES"
    warn "Sprawdź: docker compose ps, docker compose logs <usługa>. Wycofanie: $ROLLBACK"
    exit 1
fi
exit 0
}
