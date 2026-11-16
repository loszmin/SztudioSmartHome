# Stan weryfikacji – Etap 3 (integracje sprzętowe)

Zasada: funkcja jest oznaczona jako **zweryfikowana ze sprzętem** dopiero po teście z rzeczywistym
urządzeniem. Do dnia tego dokumentu **żaden test z rzeczywistą kamerą ani rejestratorem nie został wykonany**.

## Poziomy weryfikacji

| Poziom | Znaczenie |
| --- | --- |
| A – testy automatyczne | pytest / Vitest z atrapami mówiącymi prawdziwymi protokołami (RTSP, SOAP/ONVIF, WS-Discovery) przez gniazda sieciowe |
| B – stos Docker + przeglądarka | Pełny Compose (nginx HTTPS, Core, PostgreSQL, go2rtc) + **testowe źródło RTSP** (obraz kontrolny ffmpeg), sterowane z Chromium |
| C – rzeczywisty sprzęt | Kamera IP / rejestrator BCS w sieci LAN |

## Wyniki

| Funkcja | A | B | C |
| --- | --- | --- | --- |
| HTTPS z lokalnym CA (uzgodnienie TLS, odrzucenie bez zaufanego CA) | ✓ | ✓ | – |
| Nagłówki bezpieczeństwa, przekierowanie HTTP→HTTPS, nieopublikowane porty wewnętrzne | – | ✓ | – |
| WebSocket przez WSS (4 kanały) | ✓ | ✓ | – |
| Walidacja adresów RTSP, ochrona przed SSRF | ✓ | ✓ | – |
| Szyfrowanie haseł urządzeń, brak haseł w API i logach | ✓ | ✓ | – |
| Test połączenia RTSP (Digest/Basic, kody błędów) | ✓ | ✓ | **nie** |
| Rejestracja strumienia w go2rtc, sygnalizacja WebRTC przez Core | ✓ | ✓ | **nie** |
| Odtwarzanie obrazu WebRTC w przeglądarce (desktop, telefon) | ✓ (atrapa) | ✓ H.264 1280×720 | **nie** |
| Utrata sygnału → offline + alarm; powrót → automatyczne wznowienie obrazu | ✓ | ✓ | **nie** |
| Restart go2rtc → automatyczna ponowna rejestracja strumieni | ✓ | ✓ | **nie** |
| WS-Discovery (unicast, skan podsieci) | ✓ | ✓ (brak urządzeń – wynik pusty) | **nie** |
| WS-Discovery multicast | – | – | **nie** |
| ONVIF: informacje, profile, URI strumieni, błędy logowania | ✓ (atrapa SOAP + biblioteka onvif-zeep-async) | – | **nie** |
| Rejestrator: weryfikacja protokołów | ✓ | ✓ (źródło RTSP bez HTTP/ONVIF) | **nie** |
| Rejestrator: kanały przez ONVIF, import kanałów jako kamer | ✓ | – | **nie** |

## Testowe źródło RTSP

`docker-compose.e2e.yml` dodaje kontener go2rtc generujący obraz kontrolny (ffmpeg `testsrc2`)
i udostępniający go po RTSP z uwierzytelnianiem, w osobnej sieci `192.168.250.0/24`. Nie jest to kamera –
służy do sprawdzenia całej ścieżki obrazu bez sprzętu:

```bash
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build
```

Źródło: `rtsp://kamera:<E2E_RTSP_PASSWORD>@192.168.250.10:8554/main` (lub `/sub`); domyślne hasło
testowe to `e2e-haslo-kamery`. Nie używaj tej nakładki w instalacji docelowej.

## Jak wykonać weryfikację sprzętową (poziom C)

1. Uruchom stos (`docker compose up -d --build`), zainstaluj certyfikat na komputerze i telefonie.
2. Dodaj kamerę według [pierwsza-kamera.md](pierwsza-kamera.md) – raz przez wyszukiwanie ONVIF, raz ręcznie.
3. Sprawdź: test połączenia, obraz na komputerze i telefonie, odłączenie kamery od zasilania
   (status offline + alarm w ≤ 2 cykle monitora), ponowne podłączenie (obraz wraca bez odświeżania).
4. Dodaj rejestrator BCS, wykonaj test i odczyt kanałów. Zapisz wynik testu (ekran Rejestratory)
   i przekaż go zgodnie z [bcs.md](bcs.md).
5. Po pozytywnym teście danej serii rejestratora ustaw `hardware_verified = True` w odpowiedniej klasie
   adaptera (`core/app/integrations/bcs/adapter.py`) i uzupełnij tę tabelę o model i wersję firmware.
