class IntegrationError(Exception):
    """Błąd komunikacji z urządzeniem lub usługą – z kodem do diagnostyki i opisem dla użytkownika."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
