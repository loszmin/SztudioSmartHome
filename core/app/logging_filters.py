"""Filtry dziennika – tokeny nie mogą trafiać do logów."""

import logging
import re

_TOKEN_IN_URL = re.compile(r"(token=)[^&\s\"']+")

#: Loggery uvicorn, które zapisują adresy żądań (w tym adres WebSocket z `?token=`).
URL_LOGGERS = ("uvicorn.error", "uvicorn.access")


def redact_tokens(text: str) -> str:
    return _TOKEN_IN_URL.sub(r"\1***", text)


class TokenRedactingFilter(logging.Filter):
    """Zastępuje wartość parametru `token` w komunikatach dziennika."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact_tokens(record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(redact_tokens(arg) if isinstance(arg, str) else arg for arg in record.args)
        return True


def install_token_redaction() -> None:
    for name in URL_LOGGERS:
        logger = logging.getLogger(name)
        if not any(isinstance(existing, TokenRedactingFilter) for existing in logger.filters):
            logger.addFilter(TokenRedactingFilter())
