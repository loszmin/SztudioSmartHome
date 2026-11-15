"""Lokalny urząd certyfikacji i certyfikat serwera – weryfikowane prawdziwym uzgodnieniem TLS."""

import socket
import ssl
import stat
import threading
from datetime import UTC, datetime, timedelta

import pytest
from cryptography import x509

from app.certs import CA_CERT, CA_KEY, SERVER_CERT, SERVER_KEY, ensure_certificates
from app.cli import main


def load(path):
    return x509.load_pem_x509_certificate(path.read_bytes())


def test_issues_ca_and_server_certificate_for_hosts(tmp_path):
    report = ensure_certificates(tmp_path, ["192.168.1.10", "Sztudio.lan"])
    assert report.action == "issued" and report.hosts == [
        "192.168.1.10",
        "sztudio.lan",
        "localhost",
        "127.0.0.1",
    ]
    assert report.ca_fingerprint and len(report.ca_fingerprint.split(":")) == 32

    ca, server = load(tmp_path / CA_CERT), load(tmp_path / SERVER_CERT)
    constraints = ca.extensions.get_extension_for_class(x509.BasicConstraints).value
    assert constraints.ca and constraints.path_length == 0
    assert not server.extensions.get_extension_for_class(x509.BasicConstraints).value.ca
    server.verify_directly_issued_by(ca)
    names = server.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    assert {str(ip) for ip in names.get_values_for_type(x509.IPAddress)} == {"192.168.1.10", "127.0.0.1"}
    assert set(names.get_values_for_type(x509.DNSName)) == {"sztudio.lan", "localhost"}
    assert server.not_valid_after_utc - datetime.now(UTC) < timedelta(days=825)

    # Klucze prywatne nie są czytelne dla innych użytkowników.
    for name in (CA_KEY, SERVER_KEY):
        assert stat.S_IMODE((tmp_path / name).stat().st_mode) == 0o600


def test_server_certificate_is_trusted_through_local_ca_in_real_tls_handshake(tmp_path):
    ensure_certificates(tmp_path, ["192.168.1.10"])
    server_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    server_context.load_cert_chain(tmp_path / SERVER_CERT, tmp_path / SERVER_KEY)
    listener = socket.create_server(("127.0.0.1", 0))
    port = listener.getsockname()[1]

    def serve():
        for _ in range(2):
            try:
                connection, _ = listener.accept()
                with server_context.wrap_socket(connection, server_side=True) as tls:
                    tls.recv(1)
            except (ssl.SSLError, OSError):
                pass

    thread = threading.Thread(target=serve, daemon=True)
    thread.start()

    trusted = ssl.create_default_context(cafile=str(tmp_path / CA_CERT))
    with (
        socket.create_connection(("127.0.0.1", port)) as raw,
        trusted.wrap_socket(raw, server_hostname="127.0.0.1") as tls,
    ):
        assert tls.version() in ("TLSv1.2", "TLSv1.3")
        tls.send(b"x")

    # Klient, który nie zna lokalnego CA, odrzuca certyfikat – weryfikacja nie jest wyłączana.
    with socket.create_connection(("127.0.0.1", port)) as raw:
        with pytest.raises(ssl.SSLCertVerificationError):
            ssl.create_default_context().wrap_socket(raw, server_hostname="127.0.0.1")
    listener.close()
    thread.join(2)


def test_certificate_is_kept_reissued_on_new_host_and_renewed_before_expiry(tmp_path):
    ensure_certificates(tmp_path, ["192.168.1.10"])
    ca_before, serial = (tmp_path / CA_CERT).read_bytes(), load(tmp_path / SERVER_CERT).serial_number

    assert ensure_certificates(tmp_path, ["192.168.1.10"]).action == "kept"
    assert load(tmp_path / SERVER_CERT).serial_number == serial

    # Nowy adres serwera: nowy certyfikat, ten sam urząd (bez ponownej instalacji na urządzeniach).
    assert ensure_certificates(tmp_path, ["192.168.1.10", "192.168.1.11"]).action == "issued"
    assert (tmp_path / CA_CERT).read_bytes() == ca_before

    almost_expired = datetime.now(UTC) + timedelta(days=800)
    assert (
        ensure_certificates(tmp_path, ["192.168.1.10", "192.168.1.11"], now=almost_expired).action == "issued"
    )


def test_user_provided_certificate_is_left_untouched(tmp_path):
    source = tmp_path / "zrodlo"
    ensure_certificates(source, ["panel.example"])
    own = tmp_path / "wlasne"
    own.mkdir()
    for name in (SERVER_CERT, SERVER_KEY):
        (own / name).write_bytes((source / name).read_bytes())

    report = ensure_certificates(own, ["192.168.1.10"])
    assert report.action == "provided" and "panel.example" in report.hosts and report.ca_fingerprint is None
    assert sorted(path.name for path in own.iterdir()) == [SERVER_CERT, SERVER_KEY]
    assert (own / SERVER_CERT).read_bytes() == (source / SERVER_CERT).read_bytes()


def test_cli_creates_certificates_without_core_configuration(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("SZTUDIO_DATABASE_URL", raising=False)
    monkeypatch.delenv("SZTUDIO_SECRET_KEY", raising=False)
    main(["ensure-certs", "--dir", str(tmp_path), "--hosts", "192.168.1.10, sztudio.lan"])
    output = capsys.readouterr().out
    assert "Wystawiono certyfikat serwera" in output and "Odcisk SHA-256" in output
    assert (tmp_path / SERVER_CERT).exists()


def test_ca_key_can_live_outside_the_directory_served_to_nginx(tmp_path):
    public, private = tmp_path / "public", tmp_path / "ca"
    assert ensure_certificates(public, ["192.168.1.10"], ca_key_directory=private).action == "issued"
    assert sorted(path.name for path in public.iterdir()) == sorted([SERVER_CERT, SERVER_KEY, CA_CERT])
    assert [path.name for path in private.iterdir()] == [CA_KEY]
    assert ensure_certificates(public, ["192.168.1.10"], ca_key_directory=private).action == "kept"
