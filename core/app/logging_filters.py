"""Ochrona dziennika: tokeny i dane logowania urządzeń nie mogą trafiać do logów."""

import logging
import re

_TOKEN_IN_URL = re.compile(r"(token=)[^&\s\"']+")
#: Dane logowania w adresie RTSP – zapisanym wprost albo zakodowanym w parametrze zapytania.
_RTSP_CREDENTIALS = re.compile(r"(rtsp(?::|%3A)(?:/|%2F){2})[^/\s\"'@]*?(?:@|%40)", re.IGNORECASE)

#: Loggery uvicorn mają własne wyjścia i nie przekazują wpisów do loggera głównego.
URL_LOGGERS = ("uvicorn.error", "uvicorn.access")
#: Biblioteki HTTP logują pełne adresy żądań (go2rtc przyjmuje adres źródła w parametrze zapytania).
NOISY_HTTP_LOGGERS = ("httpx", "httpcore")


def redact(text: str) -> str:
    return _RTSP_CREDENTIALS.sub(r"\1***@", _TOKEN_IN_URL.sub(r"\1***", text))


class SecretRedactingFilter(logging.Filter):
    """Maskuje tokeny (`token=`) i dane logowania w adresach RTSP w komunikatach dziennika."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(
                redact(arg) if isinstance(arg, str) else redact(str(arg)) if _needs(arg) else arg
                for arg in record.args
            )
        return True


def _needs(value: object) -> bool:
    """Obiekty adresów (np. httpx.URL) są zamieniane na tekst tylko wtedy, gdy zawierają coś do zamaskowania."""
    if isinstance(value, int | float | bool | type(None)):
        return False
    text = str(value)
    return text != redact(text)


def silence_http_client_logs() -> None:
    """Wyłącza wpisy INFO bibliotek HTTP – zawierają pełne adresy żądań."""
    for name in NOISY_HTTP_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)


def install_log_redaction() -> None:
    """Zakłada maskowanie na wszystkich wyjściach dziennika i wycisza logi klientów HTTP."""
    silence_http_client_logs()
    targets: list[logging.Filterer] = [*logging.getLogger().handlers]
    for name in URL_LOGGERS:
        logger = logging.getLogger(name)
        targets.extend([logger, *logger.handlers])
    for target in targets:
        if not any(isinstance(existing, SecretRedactingFilter) for existing in target.filters):
            target.addFilter(SecretRedactingFilter())
