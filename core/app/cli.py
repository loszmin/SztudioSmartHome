"""Polecenia administracyjne: `python -m app.cli <polecenie>`."""

import argparse
import getpass
import os
import sys

from sqlalchemy import select

from app import models
from app.config import get_settings
from app.db import make_engine, make_session_factory
from app.demo import database_is_empty, seed_demo
from app.security import hash_password

MIN_PASSWORD_LENGTH = 10


def _read_password() -> str:
    """Hasło ze zmiennej SZTUDIO_ADMIN_PASSWORD albo z klawiatury – nigdy z argumentów polecenia."""
    password = os.environ.get("SZTUDIO_ADMIN_PASSWORD") or getpass.getpass("Hasło: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        sys.exit(f"Hasło musi mieć co najmniej {MIN_PASSWORD_LENGTH} znaków.")
    return password


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Administracja Sztudio Core")
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create-admin", help="Tworzy konto administratora")
    create.add_argument("--username", required=True)
    reset = commands.add_parser("reset-password", help="Ustawia nowe hasło użytkownika")
    reset.add_argument("--username", required=True)
    commands.add_parser("seed-demo", help="Ładuje dane demonstracyjne (tylko poza produkcją, do pustej bazy)")
    certs = commands.add_parser("ensure-certs", help="Tworzy lub odnawia lokalny certyfikat HTTPS panelu")
    certs.add_argument("--dir", default=os.environ.get("SZTUDIO_TLS_DIR", "/certs"))
    certs.add_argument(
        "--ca-dir",
        default=os.environ.get("SZTUDIO_TLS_CA_DIR"),
        help="Katalog klucza urzędu (domyślnie --dir)",
    )
    certs.add_argument(
        "--hosts", default=os.environ.get("SZTUDIO_TLS_HOSTS", ""), help="Nazwy i adresy IP po przecinku"
    )
    args = parser.parse_args(argv)

    if args.command == "ensure-certs":
        # Nie wymaga bazy danych ani pozostałej konfiguracji Core.
        from pathlib import Path

        from app.certs import ensure_certificates

        report = ensure_certificates(
            Path(args.dir),
            [host for host in args.hosts.split(",") if host.strip()],
            ca_key_directory=Path(args.ca_dir) if args.ca_dir else None,
        )
        messages = {
            "provided": "Używam certyfikatu dostarczonego przez użytkownika",
            "kept": "Certyfikat serwera jest aktualny",
            "issued": "Wystawiono certyfikat serwera",
        }
        print(
            f"{messages[report.action]} (ważny do {report.expires_at:%Y-%m-%d}) dla: {', '.join(report.hosts)}"
        )
        if report.ca_fingerprint:
            print(f"Odcisk SHA-256 lokalnego urzędu (sztudio-ca.crt): {report.ca_fingerprint}")
        return

    settings = get_settings()
    engine = make_engine(settings.database_url)
    with make_session_factory(engine)() as session:
        if args.command == "seed-demo":
            if settings.environment == "production":
                sys.exit(
                    "Odmowa: dane demonstracyjne nie są ładowane w trybie produkcyjnym (SZTUDIO_ENVIRONMENT)."
                )
            if not database_is_empty(session):
                sys.exit("Odmowa: baza zawiera już dane.")
            seed_demo(session)
            session.commit()
            print("Załadowano dane demonstracyjne.")
            return

        user = session.scalars(select(models.User).where(models.User.username == args.username)).first()
        if args.command == "create-admin":
            if user is not None:
                sys.exit(f"Użytkownik „{args.username}” już istnieje.")
            session.add(
                models.User(
                    id=models.new_id(),
                    username=args.username,
                    password_hash=hash_password(_read_password()),
                    role="admin",
                )
            )
            print(f"Utworzono administratora „{args.username}”.")
        else:
            if user is None:
                sys.exit(f"Nie znaleziono użytkownika „{args.username}”.")
            user.password_hash = hash_password(_read_password())
            user.token_version += 1
            print(f"Zmieniono hasło użytkownika „{args.username}”.")
        session.commit()
    engine.dispose()


if __name__ == "__main__":
    main()
