#!/usr/bin/env bash
# Sztudio Smart Home – raport diagnostyczny serwera (bez sekretów).
#
# Zbiera: wersję repozytorium, stan kontenerów i healthchecków, opublikowane porty, wersje obrazów,
# ważność certyfikatów PUBLICZNYCH, uprawnienia plików z sekretami (bez ich treści), miejsce na dyskach,
# ostatnie kopie zapasowe i ostatnie linie logów z zamaskowanymi tokenami, hasłami i danymi w adresach.
# Raport można bezpiecznie przekazać do analizy – mimo to przejrzyj go przed wysłaniem.
#
# Użycie:  scripts/diagnostics.sh [--logs N] [--output PLIK]
set -euo pipefail
# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

LOG_LINES=40
OUTPUT=""
while [ $# -gt 0 ]; do
    case "$1" in
        --logs) LOG_LINES="${2:?}"; shift 2 ;;
        --output) OUTPUT="${2:?}"; shift 2 ;;
        -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
        *) die "Nieznany argument: $1" ;;
    esac
done
[[ "$LOG_LINES" =~ ^[0-9]+$ ]] || die "--logs musi być liczbą"
resolve_compose

section() { printf '\n== %s ==\n' "$*"; }

file_meta() {
    # Wyłącznie metadane pliku – nigdy treść.
    if [ -e "$1" ]; then
        stat -c '%A %U:%G %s B, zmieniony %y' "$1" 2> /dev/null || ls -ld "$1"
    else
        echo "brak"
    fi
}

cert_info() {
    local f="$1"
    if [ ! -f "$f" ]; then echo "  $(basename "$f"): brak"; return; fi
    if ! command -v openssl > /dev/null 2>&1; then echo "  $(basename "$f"): obecny (brak openssl – bez szczegółów)"; return; fi
    local end days
    end="$(openssl x509 -in "$f" -noout -enddate 2> /dev/null | cut -d= -f2)"
    days="$(( ( $(date -d "$end" +%s 2> /dev/null || echo 0) - $(date +%s) ) / 86400 ))"
    echo "  $(basename "$f"): $(openssl x509 -in "$f" -noout -subject -nameopt oneline,-esc_msb 2> /dev/null | sed 's/^subject=//')"
    echo "    ważny do: $end (pozostało dni: $days)"
    echo "    SHA-256: $(openssl x509 -in "$f" -noout -fingerprint -sha256 2> /dev/null | cut -d= -f2)"
    if [ "$(basename "$f")" = "server.crt" ]; then
        echo "    nazwy: $(openssl x509 -in "$f" -noout -ext subjectAltName 2> /dev/null | tail -n +2 | tr -d ' ')"
    fi
}

report() {
    echo "Sztudio Smart Home – raport diagnostyczny"
    echo "czas: $(date -Iseconds)   host: $(hostname)"

    section "System"
    uname -srm
    [ -r /etc/os-release ] && sed -n 's/^PRETTY_NAME=//p' /etc/os-release | tr -d '"'
    uptime || true

    section "Repozytorium"
    echo "katalog: $SZTUDIO_ROOT"
    echo "wersja: $(code_version)"
    if [ -f "$SZTUDIO_ROOT/.sztudio-release/files.txt" ]; then
        # Pliki kodu zmienione lokalnie względem zainstalowanego wydania (bez Gita).
        local changed=0 p
        while IFS= read -r p; do
            [ -e "$SZTUDIO_ROOT/$p" ] || { echo "  brak pliku wydania: $p"; changed=$((changed + 1)); }
        done < "$SZTUDIO_ROOT/.sztudio-release/files.txt"
        echo "brakujące pliki wydania: $changed"
    fi
    if has_git; then
        echo "git: $(git -C "$SZTUDIO_ROOT" log -1 --format='%h %ci %s' 2> /dev/null), zmienione pliki: $(git -C "$SZTUDIO_ROOT" status --short --untracked-files=no 2> /dev/null | wc -l)"
    else
        echo "git: niedostępny (niewymagany)"
    fi
    echo "pliki Compose w katalogu: $(cd "$SZTUDIO_ROOT" && ls docker-compose*.yml compose*.yml 2> /dev/null | tr '\n' ' ')"
    echo "pliki Compose stosu: $(compose_files_description)"
    echo "dane bazy (kontener): $(db_mount_actual)"
    echo "dane bazy (konfiguracja): $(db_mount_expected)"

    section "Docker"
    docker version --format 'Docker {{.Server.Version}}' 2> /dev/null || echo "Docker niedostępny"
    compose version 2> /dev/null | head -n 1 || true
    echo "usługi w konfiguracji: $(compose config --services 2> /dev/null | tr '\n' ' ')"

    section "Kontenery"
    compose ps -a --format 'table {{.Service}}\t{{.State}}\t{{.Status}}\t{{.Image}}' 2> /dev/null || compose ps -a
    echo
    echo "Opublikowane porty (adres hosta → kontener):"
    local id svc
    for id in $(compose ps -q 2> /dev/null); do
        svc="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$id")"
        docker inspect -f '{{range $p, $b := .NetworkSettings.Ports}}{{if $b}}{{range $b}}  '"$svc"' {{.HostIp}}:{{.HostPort}} → {{$p}}{{println}}{{end}}{{end}}{{end}}' "$id"
    done | sed '/^$/d'
    echo
    echo "Obrazy:"
    for id in $(compose ps -q 2> /dev/null); do
        docker inspect -f '  {{index .Config.Labels "com.docker.compose.service"}}: {{.Config.Image}} ({{slice .Image 7 19}}), uruchomiony {{.State.StartedAt}}, restartów {{.RestartCount}}' "$id"
    done
    echo
    echo "Dzienniki Dockera (sterownik, limit):"
    for id in $(compose ps -q 2> /dev/null); do
        docker inspect -f '  {{index .Config.Labels "com.docker.compose.service"}}: {{.HostConfig.LogConfig.Type}} {{.HostConfig.LogConfig.Config}}' "$id"
    done

    section "Stan Core"
    if [ -n "$(compose ps -q core 2> /dev/null)" ]; then
        compose exec -T core python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=3).read().decode())" 2>&1 | redact || true
        compose exec -T core alembic current 2>&1 | grep -v '^INFO' | redact || true
    else
        echo "Core nie działa"
    fi

    section "Certyfikaty publiczne"
    cert_info "$SZTUDIO_ROOT/certs/public/sztudio-ca.crt"
    cert_info "$SZTUDIO_ROOT/certs/public/server.crt"

    section "Pliki z sekretami (tylko uprawnienia, bez treści)"
    echo "  .env: $(file_meta "$SZTUDIO_ROOT/.env")"
    echo "  certs/ca/sztudio-ca.key: $(file_meta "$SZTUDIO_ROOT/certs/ca/sztudio-ca.key")"
    echo "  certs/public/server.key: $(file_meta "$SZTUDIO_ROOT/certs/public/server.key")"

    section "Miejsce na dysku"
    df -h "$SZTUDIO_ROOT" 2> /dev/null || true
    [ -d "$SZTUDIO_BACKUP_DIR" ] && df -h "$SZTUDIO_BACKUP_DIR" | tail -n 1
    local root
    root="$(docker info --format '{{.DockerRootDir}}' 2> /dev/null || true)"
    [ -n "$root" ] && [ -d "$root" ] && df -h "$root" | tail -n 1
    docker system df 2> /dev/null || true

    section "Kopie zapasowe ($SZTUDIO_BACKUP_DIR)"
    if [ -d "$SZTUDIO_BACKUP_DIR" ]; then
        (ls -1 "$SZTUDIO_BACKUP_DIR" | grep -E "$SZTUDIO_BACKUP_PATTERN" | sort | tail -n 5 | sed 's/^/  ręczne: /') || true
        if [ -d "$SZTUDIO_BACKUP_DIR/auto" ]; then
            (ls -1 "$SZTUDIO_BACKUP_DIR/auto" | grep -E '\.dump$' | sort | tail -n 3 | sed 's/^/  automatyczne: /') || true
        fi
        local latest
        latest="$(latest_backup_dir)"
        [ -n "$latest" ] && echo "  najnowsza ręczna: $(basename "$latest"), $(du -sh "$latest" | cut -f1)"
    else
        echo "  katalog nie istnieje – brak kopii"
    fi

    section "Ostatnie linie logów (zamaskowane, $LOG_LINES na usługę)"
    for svc in $(compose ps --services 2> /dev/null); do
        echo "--- $svc"
        compose logs --no-color --tail "$LOG_LINES" "$svc" 2>&1 | redact
    done
}

if [ -n "$OUTPUT" ]; then
    (umask 077; report > "$OUTPUT" 2>&1)
    info "Raport zapisany: $OUTPUT"
else
    report
fi
