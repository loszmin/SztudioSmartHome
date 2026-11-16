# HTTPS w sieci domowej i instalacja certyfikatu

Panel Sztudio Smart Home działa wyłącznie przez HTTPS. Przy pierwszym uruchomieniu Compose tworzy
**lokalny urząd certyfikacji (CA)** i podpisany nim certyfikat serwera. Wszystko powstaje na Twoim
komputerze – internet nie jest potrzebny, a klucze nie opuszczają serwera.

Żeby przeglądarka ufała panelowi, certyfikat urzędu (`sztudio-ca.crt`) instaluje się **raz** na każdym
urządzeniu, z którego otwierasz panel. Nie wyłączaj ostrzeżeń przeglądarki ani weryfikacji certyfikatów –
zainstalowanie urzędu jest właściwym rozwiązaniem.

## Gdzie są pliki

| Plik | Zawartość | Kto go potrzebuje |
| --- | --- | --- |
| `certs/public/sztudio-ca.crt` | Publiczny certyfikat urzędu | Urządzenia (Windows, Android) – do instalacji |
| `certs/public/server.crt`, `server.key` | Certyfikat i klucz serwera | nginx (usługa `web`) |
| `certs/ca/sztudio-ca.key` | **Klucz prywatny urzędu** | Tylko generator certyfikatów. Nie kopiuj go nigdzie. |

Katalog `certs/` jest w `.gitignore`. Zrób jego kopię zapasową – po utracie klucza urzędu trzeba będzie
wygenerować nowy urząd i zainstalować go ponownie na wszystkich urządzeniach.

## Odcisk certyfikatu – sprawdź przed instalacją

Certyfikat urzędu można pobrać z panelu po zwykłym HTTP, więc przed instalacją porównaj jego odcisk
z tym, który wypisał serwer:

```bash
docker compose logs certs
```

Szukaj linii `Odcisk SHA-256 …` i `Odcisk SHA-1 …`. Windows pokazuje odcisk SHA-1 (pole „Odcisk palca”),
Android – SHA-256. Jeżeli wartości się różnią, nie instaluj certyfikatu.

## Windows 10 / 11 (Edge, Chrome)

1. Otwórz `http://ADRES-SERWERA/sztudio-ca.crt` (np. `http://192.168.1.10/sztudio-ca.crt`) i zapisz plik.
   Możesz też skopiować `certs/public/sztudio-ca.crt` z serwera na pendrive.
2. Kliknij plik dwukrotnie → zakładka **Szczegóły** → porównaj **Odcisk palca** z wartością SHA-1 z logów.
3. Zakładka **Ogólne** → **Zainstaluj certyfikat…**
4. Wybierz **Komputer lokalny** (wymaga uprawnień administratora) albo **Bieżący użytkownik**.
5. Wybierz **Umieść wszystkie certyfikaty w następującym magazynie** → **Przeglądaj** →
   **Zaufane główne urzędy certyfikacji** → **OK** → **Dalej** → **Zakończ**.
6. Zamknij wszystkie okna przeglądarki i otwórz `https://ADRES-SERWERA`.
7. Instalacja aplikacji: w Edge lub Chrome kliknij ikonę instalacji w pasku adresu
   („Zainstaluj Sztudio Smart Home”). Aplikacja uruchomi się w osobnym oknie.

Firefox korzysta z własnego magazynu certyfikatów. Jeżeli nadal widzisz ostrzeżenie: Ustawienia →
Prywatność i bezpieczeństwo → Certyfikaty → **Wyświetl certyfikaty** → Organizacje → **Importuj** →
zaznacz „Zaufaj temu CA przy identyfikacji witryn”.

## Android 11 i nowszy (Chrome)

1. Otwórz w Chrome `http://ADRES-SERWERA/sztudio-ca.crt` – plik zostanie pobrany.
2. **Ustawienia** → **Bezpieczeństwo i prywatność** → **Więcej ustawień zabezpieczeń** →
   **Szyfrowanie i dane logowania** → **Zainstaluj certyfikat** → **Certyfikat CA**.
   (Nazwy menu różnią się między producentami – szukaj w ustawieniach hasła „certyfikat CA”.)
3. Potwierdź ostrzeżenie systemu i wybierz pobrany plik `sztudio-ca.crt`.
4. Sprawdź odcisk: **Zaufane dane logowania** → karta **Użytkownik** → Sztudio Smart Home → SHA-256.
5. Otwórz w Chrome `https://ADRES-SERWERA`. Instalacja aplikacji: menu ⋮ → **Dodaj do ekranu głównego**
   / **Zainstaluj aplikację**.

Android wyświetla stałe powiadomienie „Sieć może być monitorowana” – to standardowy komunikat przy
każdym certyfikacie dodanym przez użytkownika.

Chrome na Androidzie ufa certyfikatom dodanym przez użytkownika. Natywna aplikacja Sztudio Smart Home
korzysta z tego samego zainstalowanego certyfikatu – dopuszcza go jawnie w `network_security_config.xml`
(CA systemowe + CA użytkownika, bez wyłączania weryfikacji); zob. [android/README.md](../android/README.md).

## Własny certyfikat zamiast lokalnego urzędu

Jeżeli masz certyfikat z innego źródła (np. wewnętrzny urząd firmy, własna domena):

1. Zatrzymaj stos: `docker compose down`.
2. Usuń katalog `certs/` (albo przenieś go jako kopię).
3. Umieść w `certs/public/` pliki `server.crt` (pełny łańcuch) i `server.key`.
4. Uruchom stos. Generator wykryje brak `sztudio-ca.crt` i pozostawi Twoje pliki bez zmian.

## Zmiana adresu serwera i odnowienie

- Certyfikat serwera zawiera adres `SZTUDIO_LAN_IP` oraz nazwy z `SZTUDIO_TLS_HOSTS`.
  Po ich zmianie w `.env` uruchom `docker compose up -d` – certyfikat zostanie wystawiony ponownie
  przez **ten sam** urząd, więc urządzeń nie trzeba konfigurować od nowa.
- Certyfikat serwera jest ważny 820 dni i odnawia się automatycznie przy starcie na 30 dni przed
  wygaśnięciem. Urząd jest ważny 10 lat.

## Porty

| Port hosta | Protokół | Cel |
| --- | --- | --- |
| 443 (`SZTUDIO_HTTPS_PORT`) | TCP | Panel, REST API, WebSocket (WSS) |
| 80 (`SZTUDIO_HTTP_PORT`) | TCP | Przekierowanie na HTTPS i pobranie `sztudio-ca.crt` |
| 8555 (`SZTUDIO_WEBRTC_PORT`) | TCP i UDP | Obraz z kamer (WebRTC, szyfrowany DTLS-SRTP) |

Te porty muszą być otwarte w zaporze serwera dla sieci lokalnej. Nie przekierowuj ich na routerze
do internetu – system jest przeznaczony do pracy w sieci domowej.

Nie są publikowane: PostgreSQL (5432), API Sztudio Core (8000), API i panel go2rtc (1984).

## Co zabezpiecza konfiguracja

- TLS 1.2 / 1.3, HTTP/2, HSTS.
- Nagłówki: `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy`.
- Dziennik nginx zapisuje ścieżkę bez parametrów – token WebSocket (`?token=`) nie trafia do logów.
  Core dodatkowo maskuje tokeny i dane logowania w adresach RTSP.
- Panel nie używa ciasteczek – token dostępu jest przesyłany w nagłówku `Authorization`
  (REST) i parametrze połączenia (WebSocket, wyłącznie przez WSS).
