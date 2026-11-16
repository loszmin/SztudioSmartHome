# Raport testów – aplikacja Android 1.0.0

Data: 2026-11-16. Środowisko: Linux x86_64, JDK 21, Android SDK 36, Gradle 8.14.3, AGP 8.13.2, Kotlin 2.3.21.
**Brak wirtualizacji (KVM) – emulator Androida nie był dostępny.** Żaden test nie był uruchomiony na telefonie
ani w emulatorze.

## Podsumowanie

| Zestaw | Polecenie | Wynik |
| --- | --- | --- |
| Testy z atrapami (JVM, Robolectric) | `./gradlew testDebugUnitTest` | **54 / 54** |
| Testy z prawdziwym Sztudio Core (JVM) | `./gradlew testDebugUnitTest -PrealCore` | **7 / 7** |
| Android Lint | `./gradlew lintDebug` | 0 błędów; ostrzeżenia opisane niżej |
| Budowanie APK | `./gradlew assembleDebug` | `app-debug.apk`, podpis debug zweryfikowany `apksigner` |
| Uruchomienie na urządzeniu / emulatorze | – | **nie wykonano** |

## 1. Testy z atrapami (`app/src/test`, bez kategorii `RealCoreTest`)

Atrapy mówią prawdziwymi protokołami: MockWebServer serwuje **HTTPS z certyfikatem podpisanym przez testowy
lokalny CA** (odpowiednik instalacji Sztudio) oraz **WebSocket przez WSS**. Kod aplikacji (OkHttp, Retrofit,
kotlinx.serialization, DataStore) działa naprawdę. WebRTC jest zastąpiony atrapą sesji – natywna biblioteka
nie działa na JVM.

| Klasa | Testy | Zakres |
| --- | --- | --- |
| `ServerUrlTest` | 4 | normalizacja adresu, odrzucanie `http://`, adresy nieprawidłowe |
| `LoadableTest` | 1 | oznaczanie danych nieaktualnych |
| `ErrorMapperTest` | 4 | formaty błędów Core, kody HTTP (401/403/404/429/5xx), błędy sieci, **niezaufany certyfikat i niezgodna nazwa hosta w prawdziwym uzgodnieniu TLS** |
| `SessionManagerTest` | 8 | logowanie, **token zaszyfrowany na dysku, hasło niezapisywane**, odtworzenie sesji po restarcie, wygaśnięcie tokenu, 401 kończy sesję (jednokrotnie), lokalna blokada po błędach, blokada serwera 429, wylogowanie, test serwera |
| `MonitoringRepositoryTest` | 7 | mapowanie odpowiedzi Core, utrata połączenia → dane nieaktualne, zaszyfrowana migawka i jej odczyt, potwierdzenie alarmu (POST), tryb uzbrojenia (PUT), filtry historii, diagnostyka, **sygnalizacja WebRTC (SDP → SDP, błąd 409 z kodem)** |
| `RealtimeClientTest` | 4 | 4 kanały WSS z tokenem, przekazywanie komunikatów, ponowne łączenie po zerwaniu, 4401 bez ponawiania, zatrzymanie |
| `CameraStreamControllerTest` | 7 | **cykl życia WebRTC**: oferta → odpowiedź → odtwarzanie, krótkie i trwałe rozłączenie, restart go2rtc (rosnący odstęp ponowień), limit czasu zestawiania, błędy trwałe bez ponawiania, zamknięcie sesji przy zatrzymaniu, pula strumieni (tylko widoczne kamery) |
| `UseCasesTest` | 3 | walidacja logowania przed wysłaniem, wymóg roli admin, podsumowanie dashboardu |
| `ViewModelsTest` | 6 | logowanie (podpowiedź adresu, błędy, czyszczenie hasła, odliczanie blokady), alarmy (**operacja dopiero po potwierdzeniu**, błąd API, konto tylko do odczytu), układy kamer 1/4/6 i zachowanie stanu, filtry historii w czasie lokalnym |
| `ScreensTest` (Compose, Robolectric) | 6 | ekran logowania (instrukcja CA przy niezaufanym certyfikacie, wpisywanie), dialog potwierdzenia alarmu, brak przycisków dla konta tylko do odczytu, **kafel kamery zestawia strumień tylko dla kamery mogącej nadawać**, baner danych nieaktualnych |
| `NavigationTest` (Compose, Robolectric) | 4 | dolna nawigacja, ekrany „Więcej”, **przycisk Wstecz**, pełny ekran kamery bez dolnego paska, przełączanie start → logowanie → aplikacja → wygaśnięcie sesji, banery braku sieci i braku połączenia z Core |

Usterki wykryte przez te testy i naprawione w kodzie aplikacji:

- adres `https://` bez hosta był akceptowany,
- równoczesne odrzucenie tokenu przez REST i WebSocket wylogowywało dwukrotnie,
- `CamerasViewModel` odwoływał się do stanu przed jego inicjalizacją (awaria przy natychmiastowym dispatcherze).

## 2. Testy z prawdziwym Sztudio Core (`realcore/`, kategoria `RealCoreTest`)

Te same klasy warstwy danych co w APK (SessionManager, MonitoringRepositoryImpl, RealtimeClient, OkHttp, Retrofit)
uruchomione na JVM przeciw pełnemu stosowi Docker Compose: nginx z HTTPS (lokalny CA), Sztudio Core, PostgreSQL,
go2rtc oraz testowe źródło RTSP. Zaufanie do `sztudio-ca.crt` jest ustawione jawnie w kliencie (na urządzeniu robi
to `network_security_config.xml`); weryfikacja certyfikatu i nazwy hosta pozostaje włączona.

| Test | Wynik |
| --- | --- |
| Logowanie, sesja, weryfikacja tokenu (`/auth/me`), test serwera | OK |
| Błędne hasło odrzucone | OK |
| Dashboard: status, kamery, alarmy, czujniki, zdarzenia, diagnostyka – prawdziwe dane | OK (1 kamera, 2 czujniki) |
| WebSocket: zmiana trybu uzbrojenia → `arming.changed` (kanał alarms) i `event.created` (kanał events) | OK (stan przywrócony) |
| Potwierdzenie aktywnego alarmu | OK |
| TLS: klient bez zaufania do lokalnego CA jest odrzucany jako `UntrustedCertificate` | OK |
| Sygnalizacja WebRTC: Core odrzuca nieprawidłową ofertę kodem `invalid_offer` | OK |

## 3. Czego nie zweryfikowano

| Obszar | Dlaczego | Jak zweryfikować |
| --- | --- | --- |
| Uruchomienie aplikacji na telefonie (start, logowanie, nawigacja) | brak urządzenia i emulatora | zainstalować APK, przejść scenariusz z [android/README.md](../android/README.md) |
| **Natywny podgląd WebRTC** (`NativePeerSession`, `SurfaceViewRenderer`, dekodowanie H.264) | biblioteka natywna działa tylko na Androidzie | otworzyć ekran Kamery na telefonie w sieci z działającym go2rtc |
| Zgodność oferty SDP z Android WebRTC SDK z go2rtc | j.w. | j.w.; w razie problemu – logi go2rtc i ekran Diagnostyka |
| Zaufanie do certyfikatu CA użytkownika przez `network_security_config.xml` | j.w. | zainstalować `sztudio-ca.crt` i użyć „Testuj połączenie” |
| Android Keystore (`KeystoreCryptoBox`) | Robolectric nie implementuje Keystore; testy używają tej samej logiki AES-GCM z kluczem w pamięci | logowanie i ponowne uruchomienie aplikacji na telefonie |
| Obrót ekranu i praca w tle z aktywnym obrazem | j.w. | obrócić telefon podczas podglądu, przełączyć aplikację |
| Zużycie pamięci przy 6 strumieniach na telefonie ze średniej półki | j.w. | Android Studio Profiler |

## 4. Ostrzeżenia Lint

| Ostrzeżenie | Decyzja |
| --- | --- |
| `AcceptsUserCertificates` | Zamierzone – zaufanie do lokalnego CA Sztudio zainstalowanego przez użytkownika |
| `AndroidGradlePluginVersion`, `GradleDependency`, `NewerVersionAvailable` (22) | Świadomie wybrano stabilną linię AGP 8.13 + Kotlin 2.3 + compileSdk 36. Nowsze AGP 9.x / biblioteki 2026 wymagają compileSdk 37 i zmieniają konfigurację Kotlina – do aktualizacji osobno, po testach na urządzeniu |
| `ObsoleteSdkInt` (`mipmap-anydpi-v26`) | Fałszywy alarm – bez kwalifikatora `-v26` aapt2 nie znajduje ikony adaptacyjnej |
