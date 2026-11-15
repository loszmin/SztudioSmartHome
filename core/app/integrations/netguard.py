"""Ochrona przed SSRF: Core łączy się wyłącznie z urządzeniami w dozwolonych sieciach lokalnych."""

import ipaddress
import socket
from dataclasses import dataclass

from app.integrations.errors import IntegrationError

IPNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network
IPAddress = ipaddress.IPv4Address | ipaddress.IPv6Address


class AddressNotAllowed(IntegrationError):
    pass


def parse_networks(value: str) -> tuple[IPNetwork, ...]:
    return tuple(
        ipaddress.ip_network(item.strip(), strict=False) for item in value.split(",") if item.strip()
    )


@dataclass(frozen=True)
class AddressPolicy:
    """Lista dozwolonych i wykluczonych sieci dla adresów urządzeń."""

    allowed: tuple[IPNetwork, ...]
    denied: tuple[IPNetwork, ...] = ()

    @classmethod
    def from_strings(cls, allowed: str, denied: str = "") -> "AddressPolicy":
        return cls(parse_networks(allowed), parse_networks(denied))

    def is_allowed(self, address: IPAddress) -> bool:
        if address.is_multicast or address.is_unspecified or address.is_reserved:
            return False
        if any(address in network for network in self.denied):
            return False
        return any(address in network for network in self.allowed)

    def check_ip(self, address: IPAddress) -> IPAddress:
        if not self.is_allowed(address):
            raise AddressNotAllowed(
                "address_not_allowed",
                f"Adres {address} jest poza dozwolonymi sieciami urządzeń (SZTUDIO_ALLOWED_DEVICE_NETWORKS).",
            )
        return address

    def resolve(self, host: str) -> str:
        """Zwraca adres IP hosta po sprawdzeniu polityki. Połączenie należy nawiązać z tym adresem.

        Nazwa jest rozwiązywana przy każdym użyciu, a sprawdzany jest każdy zwrócony adres –
        zmiana rekordu DNS nie pozwala ominąć ograniczenia.
        """
        host = host.strip()
        if not host:
            raise AddressNotAllowed("address_invalid", "Nie podano adresu urządzenia.")
        try:
            return str(self.check_ip(ipaddress.ip_address(host)))
        except ValueError:
            pass
        try:
            infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
        except socket.gaierror as error:
            raise IntegrationError("dns_error", f"Nie można rozwiązać nazwy „{host}”.") from error
        addresses = [ipaddress.ip_address(info[4][0]) for info in infos]
        if not addresses:
            raise IntegrationError("dns_error", f"Nazwa „{host}” nie wskazuje żadnego adresu.")
        for address in addresses:
            self.check_ip(address)
        return str(addresses[0])

    def check_network(self, cidr: str, max_hosts: int) -> list[str]:
        """Waliduje podsieć do skanowania i zwraca listę adresów hostów."""
        try:
            network = ipaddress.ip_network(cidr.strip(), strict=False)
        except ValueError as error:
            raise AddressNotAllowed(
                "address_invalid", f"„{cidr}” nie jest poprawną podsiecią (np. 192.168.1.0/24)."
            ) from error
        if network.version != 4:
            raise AddressNotAllowed("address_invalid", "Skanowanie obsługuje wyłącznie podsieci IPv4.")
        if network.num_addresses - 2 > max_hosts and network.prefixlen < 31:
            raise AddressNotAllowed(
                "network_too_large",
                f"Podsieć {network} jest zbyt duża – maksymalnie {max_hosts} adresów w jednym skanowaniu.",
            )
        if not any(network.subnet_of(allowed) for allowed in self.allowed if allowed.version == 4):
            raise AddressNotAllowed(
                "address_not_allowed", f"Podsieć {network} jest poza dozwolonymi sieciami urządzeń."
            )
        return [str(host) for host in network.hosts() if self.is_allowed(host)]
