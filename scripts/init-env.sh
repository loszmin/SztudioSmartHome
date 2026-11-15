#!/bin/sh
# Tworzy plik .env z losowymi sekretami. Uruchom raz, przed pierwszym „docker compose up”.
set -eu
cd "$(dirname "$0")/.."

if [ -e .env ]; then
  echo "Plik .env już istnieje – nie nadpisuję go." >&2
  exit 1
fi

secret() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }

lan_ip="${1:-}"
if [ -z "$lan_ip" ]; then
  # Adres interfejsu, którym host wychodzi do sieci (bez wysyłania jakichkolwiek danych).
  lan_ip="$(ip -4 route get 192.0.2.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -n1)"
fi
if [ -z "$lan_ip" ]; then
  lan_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
if [ -z "$lan_ip" ]; then
  echo "Nie udało się ustalić adresu IP hosta. Podaj go jako argument: $0 192.168.1.10" >&2
  exit 1
fi

admin_password="$(secret 9)"
umask 077
cat > .env <<ENV
# Adres IP tego komputera w sieci lokalnej (certyfikat HTTPS i połączenia WebRTC).
SZTUDIO_LAN_IP=$lan_ip
# Dodatkowe nazwy lub adresy w certyfikacie, po przecinku (np. sztudio.lan).
SZTUDIO_TLS_HOSTS=

POSTGRES_PASSWORD=$(secret 16)
SZTUDIO_SECRET_KEY=$(secret 32)
SZTUDIO_GO2RTC_PASSWORD=$(secret 16)

SZTUDIO_ADMIN_USERNAME=admin
SZTUDIO_ADMIN_PASSWORD=$admin_password

SZTUDIO_HTTPS_PORT=443
SZTUDIO_HTTP_PORT=80
SZTUDIO_WEBRTC_PORT=8555
ENV

echo "Utworzono .env (adres hosta: $lan_ip)."
echo "Login: admin   Hasło: $admin_password"
echo "Zapisz hasło – po pierwszym logowaniu zmień je w panelu lub poleceniem reset-password."
