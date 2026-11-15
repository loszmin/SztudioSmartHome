#!/bin/sh
set -e

# Migracje są stosowane przy każdym starcie – polecenie jest idempotentne.
alembic upgrade head

# Pojedynczy worker: rejestr połączeń WebSocket jest trzymany w pamięci procesu.
exec uvicorn app.main:app_factory --factory --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips '*'
