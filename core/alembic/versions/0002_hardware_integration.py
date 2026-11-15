"""hardware integration

Konfiguracja źródeł RTSP kamer, porty i szablon ścieżki rejestratorów oraz pola diagnostyczne.

Kolumna `cameras.stream_url_encrypted` jest usuwana: w wersji 1.0 była tylko zapisywana i nigdy
nieużywana. Zastępują ją pola `ip_address`, `rtsp_port`, `rtsp_path`, `username`, `password_encrypted`.
Po aktualizacji źródło kamery trzeba podać ponownie w panelu.

Revision ID: 0002
Revises: 0001
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("cameras", sa.Column("rtsp_port", sa.Integer(), nullable=True))
    op.add_column("cameras", sa.Column("rtsp_path", sa.Text(), nullable=True))
    op.add_column("cameras", sa.Column("onvif_port", sa.Integer(), nullable=True))
    op.add_column("cameras", sa.Column("stream_profile", sa.String(length=64), nullable=True))
    op.add_column("cameras", sa.Column("username", sa.String(length=100), nullable=True))
    op.add_column("cameras", sa.Column("password_encrypted", sa.Text(), nullable=True))
    op.add_column("cameras", sa.Column("enabled", sa.Boolean(), server_default="true", nullable=False))
    op.add_column(
        "cameras",
        sa.Column("stream_state", sa.String(length=16), server_default="not_configured", nullable=False),
    )
    op.add_column("cameras", sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("cameras", sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("cameras", sa.Column("last_error_code", sa.String(length=32), nullable=True))
    op.add_column("cameras", sa.Column("last_error_message", sa.Text(), nullable=True))
    op.add_column("cameras", sa.Column("response_time_ms", sa.Integer(), nullable=True))
    op.add_column(
        "cameras", sa.Column("consecutive_failures", sa.Integer(), server_default="0", nullable=False)
    )
    op.alter_column(
        "cameras",
        "ip_address",
        existing_type=sa.VARCHAR(length=45),
        type_=sa.String(length=255),
        existing_nullable=True,
    )
    op.drop_column("cameras", "stream_url_encrypted")
    op.add_column("recorders", sa.Column("rtsp_port", sa.Integer(), nullable=True))
    op.add_column("recorders", sa.Column("onvif_port", sa.Integer(), nullable=True))
    op.add_column("recorders", sa.Column("rtsp_path_template", sa.Text(), nullable=True))
    op.add_column("recorders", sa.Column("protocols", sa.JSON(), nullable=True))
    op.add_column("recorders", sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("recorders", sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("recorders", sa.Column("last_error_code", sa.String(length=32), nullable=True))
    op.add_column("recorders", sa.Column("last_error_message", sa.Text(), nullable=True))
    op.add_column("recorders", sa.Column("response_time_ms", sa.Integer(), nullable=True))
    op.add_column(
        "recorders", sa.Column("consecutive_failures", sa.Integer(), server_default="0", nullable=False)
    )
    op.alter_column(
        "recorders",
        "ip_address",
        existing_type=sa.VARCHAR(length=45),
        type_=sa.String(length=255),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "recorders",
        "ip_address",
        existing_type=sa.String(length=255),
        type_=sa.VARCHAR(length=45),
        existing_nullable=True,
    )
    op.drop_column("recorders", "consecutive_failures")
    op.drop_column("recorders", "response_time_ms")
    op.drop_column("recorders", "last_error_message")
    op.drop_column("recorders", "last_error_code")
    op.drop_column("recorders", "last_success_at")
    op.drop_column("recorders", "last_attempt_at")
    op.drop_column("recorders", "protocols")
    op.drop_column("recorders", "rtsp_path_template")
    op.drop_column("recorders", "onvif_port")
    op.drop_column("recorders", "rtsp_port")
    op.add_column("cameras", sa.Column("stream_url_encrypted", sa.TEXT(), autoincrement=False, nullable=True))
    op.alter_column(
        "cameras",
        "ip_address",
        existing_type=sa.String(length=255),
        type_=sa.VARCHAR(length=45),
        existing_nullable=True,
    )
    op.drop_column("cameras", "consecutive_failures")
    op.drop_column("cameras", "response_time_ms")
    op.drop_column("cameras", "last_error_message")
    op.drop_column("cameras", "last_error_code")
    op.drop_column("cameras", "last_success_at")
    op.drop_column("cameras", "last_attempt_at")
    op.drop_column("cameras", "stream_state")
    op.drop_column("cameras", "enabled")
    op.drop_column("cameras", "password_encrypted")
    op.drop_column("cameras", "username")
    op.drop_column("cameras", "stream_profile")
    op.drop_column("cameras", "onvif_port")
    op.drop_column("cameras", "rtsp_path")
    op.drop_column("cameras", "rtsp_port")
