"""Testy konfiguracji wdrożeniowej: Docker Compose, nginx i skrypty operacyjne.

Uruchomienie (z katalogu repozytorium):  core/.venv/bin/pytest tests/infra
Testy nie uruchamiają kontenerów – sprawdzają pliki. Pełny cykl kopii i wycofania na działającym stosie
jest opisany w docs/kopie-zapasowe.md (sekcja „Jak to zostało sprawdzone”).
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import time
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = yaml.safe_load((ROOT / "docker-compose.yml").read_text(encoding="utf-8"))
SERVICES = COMPOSE["services"]
NGINX = (ROOT / "docker" / "nginx" / "default.conf.template").read_text(encoding="utf-8")
SCRIPTS = sorted((ROOT / "scripts").glob("*.sh")) + [ROOT / "scripts" / "lib" / "common.sh"]
BACKUP_LOOP = ROOT / "docker" / "backup" / "backup-loop.sh"


def published_container_ports(service: str) -> set[str]:
    ports = SERVICES[service].get("ports", [])
    return {str(p).rsplit(":", 1)[-1] for p in ports}


# ---------- Docker Compose: ekspozycja sieciowa ----------


@pytest.mark.parametrize("service", ["db", "core", "certs", "backup"])
def test_internal_services_are_not_published(service: str) -> None:
    assert "ports" not in SERVICES[service], f"{service} nie może publikować portów na hoście"


def test_go2rtc_publishes_only_webrtc_media() -> None:
    assert published_container_ports("go2rtc") == {"8555/tcp", "8555/udp"}
    # API go2rtc (1984) i RTSP nie mogą być publikowane.
    assert not any("1984" in str(p) or "8554" in str(p) for p in SERVICES["go2rtc"]["ports"])


def test_web_publishes_only_http_and_https() -> None:
    assert published_container_ports("web") == {"443", "80"}


def test_nginx_health_endpoint_is_loopback_only() -> None:
    assert "listen 127.0.0.1:8081;" in NGINX
    assert not re.search(r"listen\s+8081", NGINX)
    assert "8081" not in str(SERVICES["web"].get("ports", []))


def test_no_privileged_containers_or_host_network() -> None:
    for name, svc in SERVICES.items():
        assert not svc.get("privileged"), name
        assert svc.get("network_mode") in (None, "none"), name


# ---------- Docker Compose: dane ----------


def test_database_volume_definition_is_unchanged() -> None:
    """Zmiana tej ścieżki odpięłaby istniejące dane bazy – zob. docs/SZTUDIO_SMART_HOME_2.0_PLAN.md (R4)."""
    assert SERVICES["db"]["volumes"] == ["db-data:/var/lib/postgresql/data"]
    assert "db-data" in COMPOSE["volumes"]
    assert SERVICES["db"]["image"].startswith("postgres:16")


def test_backup_service_is_opt_in_and_waits_for_migrations() -> None:
    backup = SERVICES["backup"]
    assert backup["profiles"] == ["backup"]
    assert backup["depends_on"]["core"]["condition"] == "service_healthy"
    assert backup["image"] == SERVICES["db"]["image"], "pg_dump musi pochodzić z tej samej wersji PostgreSQL"
    assert any(v.endswith(":/backups") for v in backup["volumes"])


# ---------- Docker Compose: eksploatacja ----------


def test_all_services_rotate_logs() -> None:
    for name, svc in SERVICES.items():
        logging = svc.get("logging")
        assert logging, f"{name}: brak konfiguracji logów"
        assert logging["driver"] == "json-file"
        assert logging["options"]["max-size"]
        assert logging["options"]["max-file"]


@pytest.mark.parametrize("service", ["db", "go2rtc", "web", "backup"])
def test_long_running_services_have_healthchecks(service: str) -> None:
    assert SERVICES[service].get("healthcheck", {}).get("test")


def test_core_healthcheck_is_defined_in_image() -> None:
    assert "HEALTHCHECK" in (ROOT / "core" / "Dockerfile").read_text(encoding="utf-8")


@pytest.mark.parametrize("service", ["core", "go2rtc", "web", "certs", "backup"])
def test_no_new_privileges(service: str) -> None:
    assert "no-new-privileges:true" in SERVICES[service].get("security_opt", [])


def test_locally_built_images_have_names_for_rollback() -> None:
    assert SERVICES["core"]["image"] == "sztudio-core:local"
    assert SERVICES["web"]["image"] == "sztudio-web:local"


# ---------- nginx ----------


def test_nginx_resolves_core_dynamically() -> None:
    """Po restarcie Core z nowym adresem IP nginx nie może zwracać 502 (błąd wykryty w teście wycofania)."""
    assert re.search(r"resolver 127\.0\.0\.11 valid=\d+s", NGINX)
    assert "proxy_pass http://core" not in NGINX
    assert NGINX.count("proxy_pass $sztudio_core;") == 2


def test_nginx_access_log_has_no_query_string() -> None:
    assert "$request " not in NGINX and '"$request"' not in NGINX
    assert "$uri" in NGINX


# ---------- skrypty ----------


@pytest.mark.parametrize("script", SCRIPTS, ids=lambda p: p.name)
def test_scripts_have_valid_bash_syntax(script: Path) -> None:
    subprocess.run(["bash", "-n", str(script)], check=True)


def test_backup_loop_has_valid_sh_syntax() -> None:
    subprocess.run(["sh", "-n", str(BACKUP_LOOP)], check=True)


@pytest.mark.skipif(shutil.which("shellcheck") is None, reason="shellcheck niezainstalowany")
def test_shellcheck() -> None:
    subprocess.run(["shellcheck", "-x", *map(str, SCRIPTS)], check=True, cwd=ROOT)
    subprocess.run(["shellcheck", "-s", "sh", str(BACKUP_LOOP)], check=True, cwd=ROOT)


FORBIDDEN = [
    (r"down\s+-v", "docker compose down -v usuwa woluminy z danymi"),
    (r"volume\s+(prune|rm)", "usuwanie woluminów"),
    (r"system\s+prune", "usuwanie danych Dockera"),
    (r"cat\s+[\"']?\$?[{]?[A-Z_]*[}]?/?\.env", "wypisywanie .env"),
    (r"(cat|less|more|head|tail)\s+\S*sztudio-ca\.key", "wypisywanie klucza CA"),
    (r"DROP\s+DATABASE\s+(IF\s+EXISTS\s+)?\\?\"\$SZTUDIO_DB_NAME", "usuwanie bazy produkcyjnej"),
]


@pytest.mark.parametrize("script", [*SCRIPTS, BACKUP_LOOP], ids=lambda p: p.name)
def test_scripts_contain_no_destructive_commands(script: Path) -> None:
    text = script.read_text(encoding="utf-8")
    code = "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("#"))
    for pattern, why in FORBIDDEN:
        assert not re.search(pattern, code, re.IGNORECASE), f"{script.name}: {why}"


def test_restore_only_drops_its_own_new_database() -> None:
    text = (ROOT / "scripts" / "restore.sh").read_text(encoding="utf-8")
    drops = re.findall(r"DROP DATABASE[^\n]*", text)
    assert drops == ['DROP DATABASE IF EXISTS \\"$NEW_DB\\"" > /dev/null || true']
    assert 'ALTER DATABASE "$SZTUDIO_DB_NAME" RENAME TO "$OLD_DB";' in text, "obecna baza musi zostać zachowana pod nową nazwą"


def run_redact(text: str) -> str:
    cmd = f'source "{ROOT}/scripts/lib/common.sh"; redact'
    return subprocess.run(["bash", "-c", cmd], input=text, capture_output=True, text=True, check=True).stdout


@pytest.mark.parametrize(
    ("line", "secret"),
    [
        ('GET /ws/v1/alarms?token=eyJhbGciOiJIUzI1NiJ9.abc.def HTTP/1.1', "eyJhbGciOiJIUzI1NiJ9"),
        ("source rtsp://admin:Kamera123@192.168.1.20:554/stream1", "Kamera123"),
        ("url=http://core:SekretGo2rtc@go2rtc:1984/api", "SekretGo2rtc"),
        ("Authorization: Bearer abc.def.ghi", "abc.def.ghi"),
        ('{"username": "admin", "password": "TajneHaslo"}', "TajneHaslo"),
        ("connect password=Haslo123&user=x", "Haslo123"),
    ],
)
def test_redact_masks_secrets(line: str, secret: str) -> None:
    out = run_redact(line + "\n")
    assert secret not in out
    assert "***" in out


def test_redact_keeps_harmless_text() -> None:
    line = "core-1 | INFO: kamera Wejście online, 1280x720, 192.168.1.20\n"
    assert run_redact(line) == line


# ---------- automatyczne kopie: healthcheck ----------


def run_loop_check(tmp_path: Path, last_success: int | None, interval_hours: int = 24) -> int:
    auto = tmp_path / "auto"
    auto.mkdir(exist_ok=True)
    status = auto / ".last-success"
    if last_success is None:
        status.unlink(missing_ok=True)
    else:
        status.write_text(f"{last_success}\n")
    env = {**os.environ, "BACKUP_DIR": str(auto), "BACKUP_INTERVAL_HOURS": str(interval_hours)}
    return subprocess.run(["sh", str(BACKUP_LOOP), "--check"], env=env, check=False).returncode


def test_backup_health_requires_recent_success(tmp_path: Path) -> None:
    now = int(time.time())
    assert run_loop_check(tmp_path, None) != 0
    assert run_loop_check(tmp_path, now - 3600) == 0
    assert run_loop_check(tmp_path, now - 47 * 3600) == 0
    assert run_loop_check(tmp_path, now - 49 * 3600) != 0


def test_backup_loop_rejects_invalid_interval(tmp_path: Path) -> None:
    env = {**os.environ, "BACKUP_DIR": str(tmp_path), "BACKUP_INTERVAL_HOURS": "0"}
    assert subprocess.run(["sh", str(BACKUP_LOOP), "--check"], env=env, check=False).returncode == 2


# ---------- katalog kopii z .env ----------


@pytest.mark.parametrize(
    ("env_line", "expected"),
    [
        ('SZTUDIO_BACKUP_DIR="/volume1/Sztudio Smart Home/backups"', "/volume1/Sztudio Smart Home/backups"),
        ("SZTUDIO_BACKUP_DIR=/volume1/Sztudio Smart Home/backups", "/volume1/Sztudio Smart Home/backups"),
        ("SZTUDIO_BACKUP_DIR='/srv/kopie'", "/srv/kopie"),
        ("SZTUDIO_BACKUP_DIR=./kopie", "{root}/kopie"),
        ("# brak klucza", "{root}/backups"),
    ],
)
def test_backup_dir_is_read_from_env_file(tmp_path: Path, env_line: str, expected: str) -> None:
    (tmp_path / "scripts" / "lib").mkdir(parents=True)
    shutil.copy(ROOT / "scripts" / "lib" / "common.sh", tmp_path / "scripts" / "lib" / "common.sh")
    (tmp_path / ".env").write_text(f"POSTGRES_PASSWORD=nie-do-odczytu\n{env_line}\n")
    env = {k: v for k, v in os.environ.items() if k not in ("SZTUDIO_BACKUP_DIR", "SZTUDIO_ROOT")}
    out = subprocess.run(
        ["bash", "-c", f'source "{tmp_path}/scripts/lib/common.sh"; printf "%s" "$SZTUDIO_BACKUP_DIR"'],
        env=env, capture_output=True, text=True, check=True,
    ).stdout
    assert out == expected.format(root=tmp_path)
