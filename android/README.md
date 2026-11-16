# Sztudio Smart Home – aplikacja Android

Natywna aplikacja (Kotlin, Jetpack Compose, Material 3) – klient istniejącego Sztudio Core.
Korzysta wyłącznie z rzeczywistych endpointów REST, kanałów WebSocket i sygnalizacji WebRTC Core –
mapowanie w [docs/ANDROID_API_MAPPING.md](../docs/ANDROID_API_MAPPING.md). Nie zawiera WebView ani danych demonstracyjnych.

> **Stan weryfikacji:** aplikacja kompiluje się, przechodzi testy na JVM (także 7 testów warstwy danych przeciw
> prawdziwemu Sztudio Core). **Nie była uruchomiona na telefonie ani w emulatorze** – w środowisku budowania nie było
> wirtualizacji. W szczególności natywny podgląd WebRTC na urządzeniu jest niezweryfikowany. Szczegóły:
> [docs/ANDROID_TEST_REPORT.md](../docs/ANDROID_TEST_REPORT.md).

## Wymagania

| Element | Wersja |
| --- | --- |
| Telefon | Android 8.0 (API 26) lub nowszy, w tej samej sieci domowej co Sztudio Core |
| JDK | 17 lub nowszy (sprawdzone z 21) |
| Android SDK | platforma 36, build-tools 35/36 |
| Gradle | wrapper 8.14.3 (w repozytorium) |
| Android Gradle Plugin / Kotlin | 8.13.2 / 2.3.21 |

## Budowanie APK

W Android Studio: otwórz katalog `android/` → **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.

Z wiersza poleceń (ścieżka do SDK w `local.properties` lub zmiennej `ANDROID_HOME`):

```bash
cd android
```

```bash
./gradlew assembleDebug
```

Wynik: `android/app/build/outputs/apk/debug/app-debug.apk` (ok. 55 MB – zawiera natywne biblioteki WebRTC
dla `arm64-v8a`, `armeabi-v7a` i `x86_64`). Wersja debug ma identyfikator `pl.sztudio.smarthome.debug`
i jest podpisana kluczem debug Android SDK.

Wersja release (`./gradlew assembleRelease`) wymaga własnego klucza podpisu – repozytorium go nie zawiera
i nie powinno zawierać.

## Instalacja na telefonie

**Przez kabel USB (adb):** włącz w telefonie Opcje programisty → Debugowanie USB, podłącz telefon, a następnie:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

**Bez komputera:** skopiuj plik APK na telefon (np. przez kabel lub dysk sieciowy), otwórz go w menedżerze
plików i zezwól tej aplikacji na **instalowanie nieznanych aplikacji**, gdy Android o to zapyta.

## Pierwsze uruchomienie

1. **Zainstaluj certyfikat CA Sztudio** – bez niego aplikacja odrzuci połączenie (celowo).
   Instrukcja: [docs/https-i-certyfikaty.md](../docs/https-i-certyfikaty.md#android-11-i-nowszy-chrome) – ten sam
   certyfikat służy przeglądarce i aplikacji. Instrukcja jest też w aplikacji: ekran logowania → „Certyfikat CA”.
2. Uruchom aplikację i wpisz **adres serwera**, np. `https://192.168.1.10` (ten sam co w przeglądarce,
   z portem, jeśli inny niż 443). Adres `http://` jest odrzucany.
3. **Testuj połączenie** – potwierdza dostępność Core i zaufanie do certyfikatu.
4. Zaloguj się kontem Sztudio Core (np. administratorem z `SZTUDIO_ADMIN_USERNAME`).

### Konfiguracja połączenia z Core

| Element | Zachowanie |
| --- | --- |
| Adres | `https://ADRES[:PORT]`; schemat `https` jest wymuszany, `http` – odrzucany |
| Certyfikat | Zaufane: CA systemowe i CA zainstalowane przez użytkownika (`res/xml/network_security_config.xml`). Weryfikacja łańcucha i nazwy hosta zawsze włączona |
| Nazwa hosta | Musi być w certyfikacie: `SZTUDIO_LAN_IP` lub `SZTUDIO_TLS_HOSTS` z `.env` serwera |
| Obraz kamer | Media WebRTC płyną z portu `SZTUDIO_WEBRTC_PORT` (domyślnie 8555 TCP/UDP) adresu `SZTUDIO_LAN_IP` – port musi być osiągalny z telefonu |
| Sesja | Token z `POST /auth/login`, ważny wg `SZTUDIO_ACCESS_TOKEN_TTL_MINUTES` (domyślnie 7 dni). Core nie odświeża tokenów – po wygaśnięciu aplikacja prosi o ponowne logowanie |
| Uprawnienia | Konto `admin` może potwierdzać alarmy i zmieniać tryb uzbrojenia; konto `viewer` – tylko podgląd |

Zmiana serwera: **Więcej → Ustawienia → Wyloguj**, a następnie podaj nowy adres na ekranie logowania.

## Bezpieczeństwo

- Token sesji i zapisany ostatni stan systemu są szyfrowane **AES-256-GCM kluczem z Android Keystore**
  (`data/auth/CryptoBox.kt`) i przechowywane w DataStore / pliku prywatnym. Hasło nie jest zapisywane.
- Kopie zapasowe i transfer danych aplikacji są wyłączone (`allowBackup=false`, `data_extraction_rules.xml`).
- Ruch nieszyfrowany jest zabroniony (`cleartextTrafficPermitted="false"`). Aplikacja nie podmienia
  TrustManagera ani HostnameVerifiera.
- Lint zgłasza ostrzeżenie `AcceptsUserCertificates` – jest ono zamierzone: zaufanie do certyfikatu CA dodanego
  przez użytkownika to jedyny sposób na zaufanie lokalnemu urzędowi Sztudio bez wbudowywania go w aplikację.
- Ochrona przed wielokrotnymi próbami logowania: blokada aplikacji po 5 błędach (30 s) oraz respektowanie
  blokady serwera (HTTP 429, `Retry-After`).
- Operacje zmieniające stan zabezpieczeń (potwierdzenie alarmu, uzbrojenie / rozbrojenie) wymagają potwierdzenia w oknie dialogowym.

## Architektura

```
app/src/main/java/pl/sztudio/smarthome/
  core/            błędy aplikacji (AppError), adres serwera, formatowanie, Loadable (dane + nieaktualność)
  domain/
    model/         modele domenowe
    repository/    interfejsy repozytoriów
    usecase/       logowanie, test serwera, potwierdzanie alarmów, uzbrajanie, podsumowanie dashboardu
  data/
    api/           Retrofit + OkHttp, DTO zgodne z core/app/schemas.py, mapowanie błędów (w tym TLS)
    auth/          sesja, Keystore, ochrona logowania
    repository/    MonitoringRepositoryImpl, SyncCoordinator (WebSocket → odświeżanie, praca w tle)
    websocket/     kanały wss:// z ponawianiem
    webrtc/        sesja WebRTC (natywny SDK), kontroler strumienia z ponawianiem, pula strumieni
    local/         migawka ostatniego stanu (szyfrowana), ustawienia, stan sieci
  presentation/    motyw, komponenty, nawigacja i ekrany (Compose + ViewModel)
  di/              ręczne wstrzykiwanie zależności (AppContainer)
```

Logika sieciowa jest wyłącznie w warstwie `data/`; ekrany dostają stan z ViewModeli.

### Kamery i WebRTC

- Sygnalizacja: aplikacja tworzy ofertę (tylko odbiór wideo, bez STUN/TURN), czeka na zebranie kandydatów ICE
  (Core nie obsługuje trickle ICE) i wysyła pełne SDP na `POST /api/v1/cameras/{id}/webrtc`. Aplikacja nie łączy
  się z go2rtc ani z kamerą i nie zna adresów RTSP.
- Strumienie są zestawiane tylko dla kamer widocznych na ekranie (układ 1 / 4 / 6), zamykane po zejściu z ekranu,
  przejściu aplikacji w tło i przy przejściu do pełnego ekranu (wtedy aktywny jest jeden).
- Utrata połączenia: krótkie rozłączenie (do 4 s) nie przerywa obrazu; trwałe – ponowne połączenie po 2, 5, 10, 20, 30 s.
  Restart go2rtc jest obsługiwany przez Core (ponowna rejestracja strumienia przy kolejnej ofercie).
- Obrót ekranu nie przerywa obrazu (Activity obsługuje zmianę konfiguracji).

### Praca offline

- Ostatni pobrany stan (status, kamery, alarmy, czujniki, zdarzenia) jest zapisywany i po ponownym uruchomieniu
  pokazywany z banerem **„Dane nieaktualne”** i godziną ostatniej aktualizacji – do czasu potwierdzenia przez serwer.
- Nieudane odświeżenie zostawia poprzednie dane, ale oznacza je jako nieaktualne.
- Baner „Brak sieci” / „Brak połączenia z Sztudio Core” jest widoczny na każdym ekranie.
- Po odzyskaniu sieci kanały WebSocket łączą się natychmiast, a dane są odświeżane.
- Podgląd kamer wymaga połączenia z serwerem – offline pokazuje stan błędu, nigdy obraz z pamięci.

## Testy

Testy z atrapami i testy z prawdziwym Core są rozdzielone kategorią JUnit `RealCoreTest`.

```bash
./gradlew testDebugUnitTest
```

Uruchamia 54 testy na JVM (bez urządzenia): MockK, MockWebServer z HTTPS i lokalnym CA (prawdziwe uzgodnienie
TLS i WSS), Robolectric + Compose UI Test. Testy z prawdziwym Core są w tym przebiegu wykluczone.

```bash
./gradlew testDebugUnitTest -PrealCore
```

Uruchamia wyłącznie testy `realcore/` przeciw działającemu Sztudio Core. Wymaga pliku `android/realcore.properties`
(jest w `.gitignore` – nie umieszczaj go w repozytorium):

```properties
url=https://192.168.1.10
username=admin
password=...
caFile=/ścieżka/do/certs/public/sztudio-ca.crt
```

Test potwierdzenia alarmu jest pomijany, gdy Core nie ma aktywnego alarmu. Test zmiany trybu uzbrojenia
**zmienia stan systemu** i przywraca poprzedni – uruchamiaj go świadomie na instalacji docelowej.
