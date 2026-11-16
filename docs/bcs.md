# Rejestratory BCS – stan integracji i wymagania

## Stan obecny

Moduł `core/app/integrations/bcs/` **nie zawiera żadnego wywołania API producenta**. Korzysta
wyłącznie z protokołów standardowych, które rejestratory BCS deklarują w specyfikacjach:

| Funkcja | Jak realizowana | Stan |
| --- | --- | --- |
| Rejestracja rejestratora (IP, porty HTTP/RTSP/ONVIF, login, hasło) | Baza Core, hasło szyfrowane | Zaimplementowane |
| Test połączenia | HTTP (sama osiągalność), RTSP `OPTIONS`, ONVIF `GetDeviceInformation` | Zaimplementowane, **nie sprawdzone z BCS** |
| Status rejestratora | Monitor: HTTP + RTSP co cykl | Zaimplementowane, **nie sprawdzone z BCS** |
| Odczyt kanałów | ONVIF `GetProfiles` + `GetStreamUri`, grupowanie po źródle wideo | Zaimplementowane, **nie sprawdzone z BCS** |
| Kanały bez ONVIF | Szablon ścieżki RTSP podany przez użytkownika | Zaimplementowane (adresy niezweryfikowane) |
| Strumienie kanałów | RTSP → go2rtc → WebRTC | Ścieżka sprawdzona ze źródłem RTSP testowym, **nie z BCS** |
| Diagnostyka | Wynik każdego protokołu, kod błędu, czas odpowiedzi | Zaimplementowane |
| Zdarzenia z rejestratora (ruch, wejścia alarmowe) | Wymaga API producenta lub zdarzeń ONVIF | **Brak** |
| Nagrania (wyszukiwanie, odtwarzanie) | Wymaga API producenta lub ONVIF Profile G | **Brak** |
| Stan dysków i nagrywania | Wymaga API producenta | **Brak** |
| PTZ przez rejestrator | ONVIF PTZ lub API producenta | **Brak** |

Pole „seria” (BCS Point / BCS Line) wybiera klasę adaptera. Obie klasy dziedziczą dziś tę samą
implementację – są przygotowane na dodanie obsługi konkretnego modelu. API `GET /api/v1/recorders/integration-info`
oraz każdy test połączenia zwracają `hardwareVerified: false`, dopóki adapter nie zostanie sprawdzony
z prawdziwym urządzeniem.

## Co jest potrzebne, żeby dokończyć integrację

Prosimy o następujące informacje o posiadanym rejestratorze:

1. Dokładne oznaczenie modelu (tabliczka znamionowa lub ekran „Informacje o systemie”), np. `BCS-P-NVR0801-4K`.
2. Seria (Point / Line) i wersja oprogramowania.
3. Porty usług ustawione w rejestratorze: HTTP, RTSP, ONVIF (menu Sieć → Porty).
4. Czy ONVIF jest włączony i czy ma osobne konto użytkownika (w wielu rejestratorach tak).
5. Format adresu RTSP z instrukcji modelu – dla strumienia głównego i pomocniczego wybranego kanału.
6. Liczba kanałów i sposób podłączenia kamer (porty PoE rejestratora czy sieć LAN).
7. **Wynik testu połączenia z panelu** (ekran Rejestratory → Testuj) – lista protokołów ze stanem,
   nagłówki `Server` oraz dane odczytane przez ONVIF (producent, model, firmware).

Na tej podstawie można:

- potwierdzić działanie odczytu kanałów i strumieni na tym modelu i oznaczyć adapter jako sprawdzony,
- zdecydować, czy funkcje z ostatnich wierszy tabeli da się zrealizować przez ONVIF (zdarzenia –
  Profile S/T, nagrania – Profile G), czy potrzebna jest dokumentacja API producenta.

## Czego moduł celowo nie robi

- Nie zgaduje adresów RTSP ani endpointów HTTP producenta.
- Nie oznacza urządzenia jako „BCS” na podstawie czegokolwiek poza nazwą, którą samo rozgłasza
  w WS-Discovery (oznaczenie „prawdopodobnie BCS” nie jest potwierdzeniem modelu).
- Nie przekazuje go2rtc źródeł innych niż `rtsp://` (go2rtc potrafi uruchamiać polecenia
  systemowe jako źródła – Core nigdy z tego nie korzysta).
