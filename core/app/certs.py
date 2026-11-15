"""Lokalny urząd certyfikacji i certyfikat serwera dla panelu w sieci domowej.

Urząd (CA) powstaje raz; jego certyfikat instaluje się na urządzeniach (Windows, Android).
Certyfikat serwera jest podpisywany przez CA i odnawiany automatycznie – bez ponownej instalacji CA.
Klucze nie opuszczają katalogu certyfikatów; do działania nie jest potrzebny internet.
"""

import ipaddress
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

CA_CERT, CA_KEY = "sztudio-ca.crt", "sztudio-ca.key"
SERVER_CERT, SERVER_KEY = "server.crt", "server.key"

CA_VALIDITY = timedelta(days=3650)
#: Limit ważności certyfikatów serwera akceptowany przez przeglądarki dla urzędów dodanych ręcznie (Apple: 825 dni).
SERVER_VALIDITY = timedelta(days=820)
RENEW_BEFORE = timedelta(days=30)
ALWAYS_HOSTS = ("localhost", "127.0.0.1")


@dataclass
class CertificateReport:
    action: str  # provided | kept | issued
    hosts: list[str]
    expires_at: datetime
    ca_fingerprint: str | None


def _name(common_name: str) -> x509.Name:
    return x509.Name(
        [
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Sztudio Smart Home"),
            x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        ]
    )


def _write(path: Path, data: bytes, *, private: bool) -> None:
    # Klucz prywatny powstaje od razu z prawami 0600 – nigdy nie jest czytelny dla innych użytkowników.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600 if private else 0o644)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(data)


def _key_pem(key: ec.EllipticCurvePrivateKey) -> bytes:
    return key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )


def fingerprint(certificate: x509.Certificate) -> str:
    digest = certificate.fingerprint(hashes.SHA256()).hex().upper()
    return ":".join(digest[index : index + 2] for index in range(0, len(digest), 2))


def normalize_hosts(hosts: list[str]) -> list[str]:
    seen: list[str] = []
    for host in [*hosts, *ALWAYS_HOSTS]:
        host = host.strip().lower()
        if host and host not in seen:
            seen.append(host)
    return seen


def _alt_names(hosts: list[str]) -> list[x509.GeneralName]:
    names: list[x509.GeneralName] = []
    for host in hosts:
        try:
            names.append(x509.IPAddress(ipaddress.ip_address(host)))
        except ValueError:
            names.append(x509.DNSName(host))
    return names


def certificate_hosts(certificate: x509.Certificate) -> list[str]:
    try:
        names = certificate.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    except x509.ExtensionNotFound:
        return []
    return [str(name.value).lower() for name in names]


def create_ca(now: datetime) -> tuple[x509.Certificate, ec.EllipticCurvePrivateKey]:
    key = ec.generate_private_key(ec.SECP256R1())
    name = _name("Sztudio Smart Home – lokalny urząd certyfikacji")
    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=5))
        .not_valid_after(now + CA_VALIDITY)
        # pathlen=0: urząd może podpisywać wyłącznie certyfikaty końcowe.
        .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                key_cert_sign=True,
                crl_sign=True,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                encipher_only=False,
                decipher_only=False,
            ),  # fmt: skip
            critical=True,
        )
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
        .sign(key, hashes.SHA256())
    )
    return certificate, key


def issue_server_certificate(
    ca_certificate: x509.Certificate, ca_key: ec.EllipticCurvePrivateKey, hosts: list[str], now: datetime
) -> tuple[x509.Certificate, ec.EllipticCurvePrivateKey]:
    key = ec.generate_private_key(ec.SECP256R1())
    certificate = (
        x509.CertificateBuilder()
        .subject_name(_name(hosts[0]))
        .issuer_name(ca_certificate.subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=5))
        .not_valid_after(now + SERVER_VALIDITY)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.SubjectAlternativeName(_alt_names(hosts)), critical=False)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                key_cert_sign=False,
                crl_sign=False,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                encipher_only=False,
                decipher_only=False,
            ),  # fmt: skip
            critical=True,
        )
        .add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False
        )
        .sign(ca_key, hashes.SHA256())
    )
    return certificate, key


def ensure_certificates(
    directory: Path, hosts: list[str], now: datetime | None = None, ca_key_directory: Path | None = None
) -> CertificateReport:
    """Zapewnia certyfikat serwera w `directory`.

    - Jeżeli katalog zawiera `server.crt` i `server.key`, a nie ma w nim `sztudio-ca.crt`, są to
      certyfikaty dostarczone przez użytkownika – pozostają nietknięte.
    - Klucz prywatny urzędu można trzymać w osobnym katalogu (`ca_key_directory`), którego serwer WWW
      nie widzi; do pracy panelu potrzebne są tylko `server.crt` i `server.key`.
    - W przeciwnym razie tworzony jest lokalny CA (jeśli go nie ma) i certyfikat serwera dla podanych
      nazw i adresów. Certyfikat jest wystawiany ponownie, gdy zmieni się lista adresów lub zbliża się
      koniec ważności; CA pozostaje ten sam.
    """
    now = now or datetime.now(UTC)
    directory.mkdir(parents=True, exist_ok=True)
    ca_key_directory = ca_key_directory or directory
    ca_key_directory.mkdir(parents=True, exist_ok=True)
    ca_cert_path, ca_key_path = directory / CA_CERT, ca_key_directory / CA_KEY
    cert_path, key_path = directory / SERVER_CERT, directory / SERVER_KEY
    hosts = normalize_hosts(hosts)

    if cert_path.exists() and key_path.exists() and not ca_cert_path.exists():
        certificate = x509.load_pem_x509_certificate(cert_path.read_bytes())
        return CertificateReport(
            "provided", certificate_hosts(certificate), certificate.not_valid_after_utc, None
        )

    if ca_cert_path.exists() and ca_key_path.exists():
        ca_certificate = x509.load_pem_x509_certificate(ca_cert_path.read_bytes())
        ca_key = serialization.load_pem_private_key(ca_key_path.read_bytes(), password=None)
    else:
        ca_certificate, ca_key = create_ca(now)
        _write(ca_key_path, _key_pem(ca_key), private=True)
        _write(ca_cert_path, ca_certificate.public_bytes(serialization.Encoding.PEM), private=False)

    if cert_path.exists() and key_path.exists():
        current = x509.load_pem_x509_certificate(cert_path.read_bytes())
        signed_by_ca = current.issuer == ca_certificate.subject
        if (
            signed_by_ca
            and set(hosts) <= set(certificate_hosts(current))
            and current.not_valid_after_utc - now > RENEW_BEFORE
        ):
            return CertificateReport(
                "kept", certificate_hosts(current), current.not_valid_after_utc, fingerprint(ca_certificate)
            )

    certificate, key = issue_server_certificate(ca_certificate, ca_key, hosts, now)  # type: ignore[arg-type]
    _write(key_path, _key_pem(key), private=True)
    _write(cert_path, certificate.public_bytes(serialization.Encoding.PEM), private=False)
    return CertificateReport("issued", hosts, certificate.not_valid_after_utc, fingerprint(ca_certificate))
