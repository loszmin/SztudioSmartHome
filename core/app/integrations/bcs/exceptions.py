from app.integrations.errors import IntegrationError


class BcsError(IntegrationError):
    """Błąd integracji z rejestratorem."""


class BcsConnectionError(BcsError):
    """Rejestrator nie odpowiada na żadnym ze sprawdzanych protokołów."""


class BcsAuthError(BcsError):
    """Rejestrator odrzucił dane logowania."""


class BcsNotImplementedError(BcsError):
    """Funkcja wymaga API producenta, którego adapter jeszcze nie obsługuje."""

    def __init__(self, feature: str) -> None:
        super().__init__(
            "vendor_api_not_implemented",
            f"Funkcja „{feature}” wymaga adaptera dla konkretnego modelu rejestratora – nie jest jeszcze dostępna.",
        )
