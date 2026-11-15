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

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip().rstrip("/") for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
