from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Konfiguracja Sztudio Core – wyłącznie ze zmiennych środowiskowych `SZTUDIO_*`."""

    model_config = SettingsConfigDict(env_prefix="SZTUDIO_", env_file=".env", extra="ignore")

    environment: Literal["production", "development", "test"] = "production"
    database_url: str
    #: Sekret, z którego wyprowadzane są klucze podpisu tokenów i szyfrowania haseł urządzeń.
    secret_key: SecretStr = Field(min_length=32)

    access_token_ttl_minutes: int = Field(default=60 * 24 * 7, ge=5)
    login_max_attempts: int = Field(default=5, ge=1)
    login_lockout_seconds: int = Field(default=60, ge=1)

    #: Dozwolone originy CORS, rozdzielone przecinkami. Puste = tylko ten sam origin.
    cors_origins: str = ""

    #: Konto administratora tworzone przy pierwszym uruchomieniu (gdy baza nie ma użytkowników).
    admin_username: str | None = None
    admin_password: SecretStr | None = None

    # ---------- Integracje sprzętowe ----------

    #: Adres API go2rtc w sieci wewnętrznej (np. http://go2rtc:1984). Puste = go2rtc nieskonfigurowany.
    go2rtc_url: str | None = None
    go2rtc_username: str | None = None
    go2rtc_password: SecretStr | None = None

    #: Sieci, w których mogą znajdować się kamery i rejestratory (ochrona przed SSRF).
    allowed_device_networks: str = "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
    #: Sieci wykluczone mimo dopasowania do listy dozwolonych (np. wewnętrzna sieć Docker Compose).
    denied_device_networks: str = ""

    #: Odstęp cyklu monitorowania urządzeń; 0 wyłącza monitor.
    monitor_interval_seconds: int = Field(default=30, ge=0)
    #: Liczba kolejnych nieudanych prób, po której urządzenie jest oznaczane jako offline.
    monitor_failure_threshold: int = Field(default=2, ge=1)
    device_timeout_seconds: float = Field(default=5.0, gt=0, le=60)
    #: Maksymalna liczba adresów w jednym skanowaniu podsieci (wykrywanie ONVIF).
    discovery_max_hosts: int = Field(default=1024, ge=1, le=65536)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip().rstrip("/") for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
