# Podłączenie pierwszej kamery

## Zanim zaczniesz

- Kamera lub rejestrator jest w tej samej sieci lokalnej co serwer Sztudio Core (albo w sieci
  osiągalnej przez router) i ma adres z zakresu `SZTUDIO_ALLOWED_DEVICE_NETWORKS`
  (domyślnie 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16).
- Znasz adres IP kamery, login i hasło. Dobrą praktyką jest założenie w kamerze osobnego konta
  tylko do podglądu.
- Kamera ma włączony RTSP (zwykle domyślnie) i – jeśli chcesz automatycznie odczytać profile – ONVIF.
- Panel jest otwarty przez HTTPS i jesteś zalogowany jako administrator
  (Ustawienia → Użytkownicy i bezpieczeństwo).

## Sposób 1: wyszukiwanie ONVIF

1. **Kamery** → **Szukaj ONVIF**.
2. Wybierz **Skan podsieci** i wpisz sieć, np. `192.168.1.0/24` → **Szukaj**.
   - Tryb „Rozgłoszenie (multicast)” działa tylko wtedy, gdy Core jest w tej samej domenie
     rozgłoszeniowej co kamery. W instalacji Docker Compose Core pracuje w sieci mostkowej,
     więc multicast zwykle **nie** dociera do kamer – używaj skanu podsieci.
3. Przy znalezionym urządzeniu kliknij **Skonfiguruj**. Adres IP i port ONVIF zostaną wpisane.
4. Podaj **login** i **hasło** → **Wczytaj profile ONVIF**. Panel pokaże producenta, model
   i profile strumieni (np. główny 1920×1080, pomocniczy 640×360).
5. Przy wybranym profilu kliknij **Użyj** – port i ścieżka RTSP zostaną uzupełnione.
   Do podglądu wielu kamer naraz wybieraj profil pomocniczy (mniejsze obciążenie sieci).
6. **Testuj połączenie** → powinien pojawić się komunikat „Połączenie działa” z kodekiem (np. H264).
7. **Zapisz**. Obraz pojawi się w ciągu kilku sekund.

## Sposób 2: adres IP i ścieżka RTSP

1. **Kamery** → **Dodaj kamerę**.
2. Wpisz nazwę, adres IP, port RTSP (zwykle 554), login, hasło i **ścieżkę strumienia**
   z instrukcji kamery (np. `/stream1`, `/Streaming/Channels/101`, `/cam/realmonitor?channel=1&subtype=0`).
   Zamiast pól możesz wkleić pełny adres `rtsp://login:hasło@adres:554/ścieżka` – zostanie
   rozłożony na pola, a hasło zaszyfrowane.
3. **Testuj połączenie** → **Zapisz**.

## Kamery podłączone do rejestratora

1. **Rejestratory** → **Dodaj rejestrator** → adres, porty, login, hasło → **Testuj połączenie**.
   Wynik pokaże, które protokoły (HTTP, RTSP, ONVIF) odpowiadają.
2. **Zapisz** → na karcie rejestratora rozwiń **Kanały rejestratora**.
   - Jeżeli rejestrator obsługuje ONVIF, kanały i profile zostaną odczytane z urządzenia.
   - Jeżeli nie, wpisz w edycji rejestratora liczbę kanałów i **szablon ścieżki RTSP** z instrukcji
     modelu (pola `{channel}` i `{subtype}`). Kanały wyliczone z szablonu są oznaczone jako
     niezweryfikowane – sprawdzi je test po dodaniu.
3. Kliknij **Dodaj** przy kanale (albo **Dodaj wszystkie kanały**). Kamery dziedziczą adres
   i dane logowania rejestratora.

## Gdy coś nie działa

Komunikat błędu i kod są widoczne w formularzu, w szczegółach kamery i na ekranie **Diagnostyka**.

| Kod | Znaczenie | Co zrobić |
| --- | --- | --- |
| `auth_failed` | Kamera odrzuciła login lub hasło | Sprawdź dane logowania; niektóre kamery blokują konto po kilku błędach |
| `auth_required` | Kamera wymaga logowania | Podaj login i hasło |
| `stream_not_found` | Brak strumienia pod ścieżką | Sprawdź ścieżkę w instrukcji albo wczytaj profile ONVIF |
| `connection_refused` | Port zamknięty | Sprawdź port RTSP (554?) i czy RTSP jest włączony |
| `timeout`, `unreachable` | Brak odpowiedzi | Kamera wyłączona, inny adres IP, zapora albo inna sieć |
| `address_not_allowed` | Adres poza dozwolonymi sieciami | Kamera musi być w sieci lokalnej; ewentualnie rozszerz `SZTUDIO_ALLOWED_DEVICE_NETWORKS` |
| `not_onvif` | Pod portem nie działa ONVIF | Sprawdź port ONVIF (80, 8000, 8080…) i czy ONVIF jest włączony |
| `go2rtc_unavailable` | Usługa strumieni nie odpowiada | `docker compose ps`, `docker compose logs go2rtc` |

Jeżeli test połączenia przechodzi, a obrazu nie ma:

- port WebRTC (domyślnie 8555 TCP i UDP) musi być otwarty w zaporze serwera,
- `SZTUDIO_LAN_IP` w `.env` musi być adresem, pod którym urządzenia widzą serwer,
- kamera musi wysyłać obraz w H.264 – przeglądarki nie odtwarzają H.265 (HEVC) przez WebRTC.
  Zmień kodek strumienia (najlepiej pomocniczego) w ustawieniach kamery na H.264.

Status kamer sprawdza monitor co `SZTUDIO_MONITOR_INTERVAL_SECONDS` (domyślnie 30 s). Kamera jest
oznaczana jako offline po dwóch kolejnych nieudanych próbach – wtedy powstaje alarm. Po powrocie
kamery alarm zamyka się sam, a panel wznawia obraz bez odświeżania strony.
