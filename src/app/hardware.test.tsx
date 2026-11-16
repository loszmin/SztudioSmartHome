import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakePeerConnection } from '@/services/go2rtc/webrtc.test';
import { useSettingsStore } from '@/stores/settingsStore';
import { stubCore } from '@/test/fakeCore';
import { renderApp } from '@/test/renderApp';

const main = () => within(screen.getByRole('main'));

const CAMERA = {
  id: 'cam-1', name: 'Wejście', location: 'Front', status: 'online', signalQuality: 100, source: 'rtsp',
  streamName: 'cam_1', recording: false, lastSeenAt: new Date().toISOString(), enabled: true, streamState: 'registered',
};

function live() {
  useSettingsStore.setState({ mode: 'live', serverUrl: 'http://core.test', apiToken: 'token' });
}

afterEach(() => {
  FakePeerConnection.instances = [];
  vi.useRealTimers();
});

describe('kamery – konfiguracja', () => {
  it('dodaje kamerę: test połączenia, zapis i komunikat o wyniku', async () => {
    live();
    const cameras: unknown[] = [];
    const { calls } = stubCore({
      'GET /api/v1/cameras': () => ({ body: cameras }),
      'POST /api/v1/cameras/test': (body) =>
        (body as { password?: string }).password === 'tajne'
          ? { body: { ok: true, code: 'ok', message: 'Połączenie poprawne.', responseTimeMs: 12, tracks: [{ media: 'video', codec: 'H264' }] } }
          : { body: { ok: false, code: 'auth_failed', message: 'Kamera odrzuciła login lub hasło.', tracks: [] } },
      'POST /api/v1/cameras': (body) => {
        const created = { ...CAMERA, ...(body as object), hasPassword: true, vendor: '', model: '' };
        cameras.push(created);
        return { status: 201, body: created };
      },
    });
    const { user } = renderApp('/kamery');
    await user.click(await main().findByRole('button', { name: 'Dodaj kamerę' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Dodaj kamerę' }));

    await user.click(dialog.getByRole('button', { name: 'Testuj połączenie' }));
    expect(dialog.getByText('Podaj adres IP kamery.')).toBeInTheDocument();

    await user.type(dialog.getByLabelText('Nazwa kamery'), 'Wejście');
    await user.type(dialog.getByLabelText('Adres IP kamery'), '192.168.1.64');
    await user.type(dialog.getByLabelText('Ścieżka strumienia RTSP'), '/stream1');
    await user.type(dialog.getByLabelText('Login'), 'admin');
    await user.type(dialog.getByLabelText('Hasło'), 'zle');
    await user.click(dialog.getByRole('button', { name: 'Testuj połączenie' }));
    expect(await dialog.findByText('Brak połączenia')).toBeInTheDocument();
    expect(dialog.getByText(/kod: auth_failed/)).toBeInTheDocument();

    await user.clear(dialog.getByLabelText('Hasło'));
    await user.type(dialog.getByLabelText('Hasło'), 'tajne');
    await user.click(dialog.getByRole('button', { name: 'Testuj połączenie' }));
    expect(await dialog.findByText('Połączenie działa')).toBeInTheDocument();
    expect(dialog.getByText(/12 ms/)).toBeInTheDocument();

    await user.click(dialog.getByRole('button', { name: 'Zapisz' }));
    expect(await screen.findByText(/Zapisano kamerę „Wejście” – połączenie działa/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const saved = calls.find((call) => call.method === 'POST' && call.path === '/api/v1/cameras')!.body;
    expect(saved).toMatchObject({ name: 'Wejście', host: '192.168.1.64', rtspPort: 554, rtspPath: '/stream1', username: 'admin', password: 'tajne' });
    expect(await main().findByRole('article', { name: 'Kamera Wejście' })).toBeInTheDocument();
  });

  it('pokazuje błąd zwrócony przez Core (np. adres poza siecią lokalną)', async () => {
    live();
    stubCore({
      'POST /api/v1/cameras': () => ({
        status: 422,
        body: { detail: { code: 'address_not_allowed', message: 'Adres 8.8.8.8 jest poza dozwolonymi sieciami urządzeń.' } },
      }),
    });
    const { user } = renderApp('/kamery');
    await user.click(await main().findByRole('button', { name: 'Dodaj kamerę' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Nazwa kamery'), 'Obca');
    await user.type(dialog.getByLabelText('Adres IP kamery'), '8.8.8.8');
    await user.type(dialog.getByLabelText('Ścieżka strumienia RTSP'), '/s');
    await user.click(dialog.getByRole('button', { name: 'Zapisz' }));
    expect(await dialog.findByText(/poza dozwolonymi sieciami/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('edycja wczytuje konfigurację, nie zna hasła i wysyła tylko zmiany połączenia', async () => {
    live();
    const { calls } = stubCore({
      'GET /api/v1/cameras': () => ({ body: [CAMERA] }),
      'GET /api/v1/cameras/cam-1/config': () => ({
        body: { ...CAMERA, host: '192.168.1.64', rtspPort: 554, rtspPath: '/stream1', username: 'admin', hasPassword: true, vendor: 'X', model: 'Y' },
      }),
      'PATCH /api/v1/cameras/cam-1': (body) => ({ body: { ...CAMERA, ...(body as object), hasPassword: true, vendor: 'X', model: 'Y' } }),
    });
    const { user } = renderApp('/kamery');
    await user.click(await main().findByRole('button', { name: 'Edytuj' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Edycja kamery' }));
    expect(await dialog.findByDisplayValue('/stream1')).toBeInTheDocument();
    expect(dialog.getByLabelText('Hasło')).toHaveValue('');
    expect(dialog.getByText(/Zapisane. Zostaw puste/)).toBeInTheDocument();

    await user.clear(dialog.getByLabelText('Ścieżka strumienia RTSP'));
    await user.type(dialog.getByLabelText('Ścieżka strumienia RTSP'), '/stream2');
    await user.click(dialog.getByRole('button', { name: 'Zapisz' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const patch = calls.find((call) => call.method === 'PATCH')!.body as Record<string, unknown>;
    expect(patch.rtspPath).toBe('/stream2');
    expect('password' in patch).toBe(false);
  });

  it('usuwa kamerę po potwierdzeniu', async () => {
    live();
    let cameras: unknown[] = [CAMERA];
    stubCore({
      'GET /api/v1/cameras': () => ({ body: cameras }),
      'DELETE /api/v1/cameras/cam-1': () => {
        cameras = [];
        return { status: 204 };
      },
    });
    const { user } = renderApp('/kamery');
    await user.click(await main().findByRole('button', { name: 'Usuń' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Usunąć kamerę?' })).getByRole('button', { name: 'Usuń kamerę' }));
    expect(await screen.findByText('Kamera została usunięta.')).toBeInTheDocument();
    expect(await main().findByText('Brak skonfigurowanych kamer')).toBeInTheDocument();
  });

  it('pokazuje przyczynę braku połączenia i stan go2rtc', async () => {
    live();
    stubCore({
      'GET /api/v1/cameras': () => ({
        body: [{ ...CAMERA, status: 'offline', signalQuality: null, errorCode: 'connection_refused', errorMessage: 'Urządzenie odrzuciło połączenie – sprawdź port.' }],
      }),
    });
    renderApp('/kamery');
    expect(await main().findByText('go2rtc: działa')).toBeInTheDocument();
    const details = within(await main().findByRole('region', { name: 'Wybrana kamera' }));
    expect(details.getByText(/Urządzenie odrzuciło połączenie/)).toBeInTheDocument();
    expect(details.getByText('kod: connection_refused')).toBeInTheDocument();
  });

  it('w trybie demonstracyjnym nie pokazuje funkcji administracyjnych', async () => {
    renderApp('/kamery');
    await main().findAllByRole('article');
    expect(main().queryByRole('button', { name: 'Dodaj kamerę' })).not.toBeInTheDocument();
    expect(main().queryByRole('button', { name: 'Edytuj' })).not.toBeInTheDocument();
  });
});

describe('wyszukiwanie ONVIF', () => {
  it('skanuje podsieć i przenosi wybrane urządzenie do formularza kamery', async () => {
    live();
    const { calls } = stubCore({
      'POST /api/v1/onvif/discover': () => ({
        body: {
          mode: 'subnet', scannedHosts: 254,
          devices: [{ ip: '192.168.1.70', onvifPort: 8000, name: 'BCS NVR', hardware: 'BCS-P-NVR0401', likelyBcs: true, alreadyAdded: false }],
        },
      }),
      'POST /api/v1/onvif/inspect': () => ({
        body: {
          manufacturer: 'BCS', model: 'BCS-P-NVR0401',
          profiles: [
            { token: 'p1', name: 'Główny', encoding: 'H264', resolution: '1920×1080', fps: 25, rtspPort: 554, rtspPath: '/ch1/main' },
            { token: 'p2', name: 'Bez adresu', error: 'Urządzenie nie podało adresu.' },
          ],
        },
      }),
    });
    const { user } = renderApp('/kamery');
    await user.click(await main().findByRole('button', { name: 'Szukaj ONVIF' }));
    const discovery = within(screen.getByRole('dialog', { name: 'Wyszukiwanie kamer ONVIF' }));
    await user.click(discovery.getByRole('button', { name: 'Szukaj' }));
    expect(discovery.getByText(/Podaj podsieć/)).toBeInTheDocument();

    await user.type(discovery.getByLabelText('Podsieć'), '192.168.1.0/24');
    await user.click(discovery.getByRole('button', { name: 'Szukaj' }));
    const found = within(await discovery.findByRole('list', { name: 'Znalezione urządzenia' }));
    expect(found.getByText('192.168.1.70:8000 · BCS-P-NVR0401')).toBeInTheDocument();
    expect(found.getByText('prawdopodobnie BCS')).toBeInTheDocument();
    expect(calls.find((call) => call.path === '/api/v1/onvif/discover')!.body).toEqual({ mode: 'subnet', network: '192.168.1.0/24' });

    await user.click(found.getByRole('button', { name: 'Skonfiguruj' }));
    const form = within(await screen.findByRole('dialog', { name: 'Dodaj kamerę' }));
    expect(form.getByLabelText('Adres IP kamery')).toHaveValue('192.168.1.70');
    expect(form.getByLabelText('Port ONVIF')).toHaveValue('8000');

    await user.click(form.getByRole('button', { name: 'Wczytaj profile ONVIF' }));
    const profiles = within(await form.findByRole('list', { name: 'Profile ONVIF' }));
    expect(profiles.getAllByRole('button', { name: 'Użyj' })[1]).toBeDisabled();
    await user.click(profiles.getAllByRole('button', { name: 'Użyj' })[0]!);
    expect(form.getByLabelText('Ścieżka strumienia RTSP')).toHaveValue('/ch1/main');
  });
});

describe('rejestratory', () => {
  const RECORDER = {
    id: 'rec-1', name: 'NVR', vendor: 'BCS', series: 'bcs_point', model: '', ipAddress: '192.168.1.20', port: 80,
    rtspPort: 554, onvifPort: 80, hasPassword: true, status: 'online', lastSeenAt: new Date().toISOString(),
    protocols: [
      { protocol: 'http', port: 80, state: 'ok', detail: 'Interfejs WWW odpowiada.' },
      { protocol: 'rtsp', port: 554, state: 'ok', detail: 'Usługa RTSP odpowiada.' },
      { protocol: 'onvif', port: 80, state: 'auth_failed', detail: 'Urządzenie odrzuciło login lub hasło ONVIF.' },
    ],
  };
  const INFO = {
    adapters: [{ series: 'bcs_point', label: 'BCS Point', hardwareVerified: false }],
    requiredInformation: ['Dokładne oznaczenie modelu rejestratora.'],
    unsupportedFeatures: ['Odtwarzanie i wyszukiwanie nagrań'],
  };

  it('pokazuje stan protokołów, uczciwą informację o integracji i dodaje kanały jako kamery', async () => {
    live();
    let imported = false;
    const { calls } = stubCore({
      'GET /api/v1/recorders': () => ({ body: [RECORDER] }),
      'GET /api/v1/recorders/integration-info': () => ({ body: INFO }),
      'GET /api/v1/recorders/rec-1/channels': () => ({
        body: [
          { number: 1, name: 'Kanał 1', origin: 'onvif', profiles: [{ name: 'Główny', rtspPath: '/ch1/main', resolution: '1920×1080' }, { name: 'Pomocniczy', rtspPath: '/ch1/sub' }], ...(imported ? { cameraId: 'cam-9' } : {}) },
          { number: 2, name: 'Kanał 2', origin: 'onvif', profiles: [{ name: 'Główny', error: 'Brak adresu' }] },
        ],
      }),
      'POST /api/v1/recorders/rec-1/channels/import': () => {
        imported = true;
        return { status: 201, body: [{ ...CAMERA, id: 'cam-9', name: 'NVR – kanał 1' }] };
      },
    });
    const { user } = renderApp('/rejestratory');
    const card = within(await main().findByRole('article', { name: 'NVR' }));
    expect(card.getByText('ONVIF :80 – odrzucone logowanie')).toBeInTheDocument();
    expect(main().getByText(/nie była jeszcze\s+sprawdzana z rzeczywistym rejestratorem/)).toBeInTheDocument();

    await user.click(main().getByRole('button', { name: /Co jest potrzebne/ }));
    expect(main().getByText('Dokładne oznaczenie modelu rejestratora.')).toBeInTheDocument();

    await user.click(card.getByRole('button', { name: 'Kanały rejestratora' }));
    const channels = within(await card.findByRole('list', { name: 'Kanały rejestratora NVR' }));
    expect(channels.getByText(/Brak adresu strumienia/)).toBeInTheDocument();
    await user.selectOptions(channels.getByLabelText('Profil kanału 1'), 'Pomocniczy');
    await user.click(channels.getByRole('button', { name: 'Dodaj' }));
    expect(await screen.findByText('Dodano kamerę „NVR – kanał 1”.')).toBeInTheDocument();
    expect(calls.find((call) => call.path.endsWith('/import'))!.body).toEqual({ channels: [{ number: 1, profile: 'Pomocniczy' }] });
    expect(await channels.findByText('dodany jako kamera')).toBeInTheDocument();
  });

  it('testuje połączenie z nowym rejestratorem przed zapisem', async () => {
    live();
    const { calls } = stubCore({
      'GET /api/v1/recorders/integration-info': () => ({ body: INFO }),
      'POST /api/v1/recorders/test': () => ({
        body: {
          reachable: true, code: 'auth_failed', message: 'Rejestrator odpowiada, ale odrzucił login lub hasło.',
          checks: RECORDER.protocols, adapter: 'bcs_point', hardwareVerified: false,
        },
      }),
    });
    const { user } = renderApp('/rejestratory');
    await user.click(await main().findByRole('button', { name: 'Dodaj rejestrator' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Dodaj rejestrator' }));
    await user.type(dialog.getByLabelText('Adres IP'), '192.168.1.20');
    await user.type(dialog.getByLabelText('Login'), 'admin');
    await user.type(dialog.getByLabelText('Hasło'), 'x');
    await user.click(dialog.getByRole('button', { name: 'Testuj połączenie' }));
    expect(await dialog.findByText('Rejestrator odpowiada, ale odrzucił login lub hasło.')).toBeInTheDocument();
    expect(dialog.getByText(/nie był jeszcze sprawdzany z rzeczywistym rejestratorem/)).toBeInTheDocument();
    expect(within(dialog.getByRole('list', { name: 'Sprawdzone protokoły' })).getAllByRole('listitem')).toHaveLength(3);
    expect(calls.find((call) => call.path === '/api/v1/recorders/test')!.body).toMatchObject({
      ipAddress: '192.168.1.20', series: 'bcs_point', rtspPort: 554, username: 'admin', password: 'x',
    });
  });
});

describe('diagnostyka', () => {
  it('pokazuje stan go2rtc, monitora i każdego urządzenia', async () => {
    live();
    const now = new Date().toISOString();
    const { calls } = stubCore({
      'GET /api/v1/diagnostics': () => ({
        body: {
          generatedAt: now,
          go2rtc: { state: 'error', errorCode: 'go2rtc_unavailable', errorMessage: 'Brak połączenia z usługą go2rtc.', checkedAt: now },
          monitor: { enabled: true, intervalSeconds: 30, lastRunAt: now, lastDurationMs: 120 },
          devices: [
            { id: 'cam-1', kind: 'camera', name: 'Wejście', address: '192.168.1.64:554/stream1', status: 'offline', enabled: true, streamState: 'error', lastAttemptAt: now, errorCode: 'timeout', errorMessage: 'Urządzenie nie odpowiedziało.' },
            { id: 'rec-1', kind: 'recorder', name: 'NVR', address: '192.168.1.20:80', status: 'online', enabled: true, lastAttemptAt: now, lastSuccessAt: now, responseTimeMs: 8 },
          ],
        },
      }),
      'POST /api/v1/diagnostics/run': () => ({ body: { generatedAt: now, go2rtc: { state: 'running' }, monitor: { enabled: true, intervalSeconds: 30 }, devices: [] } }),
    });
    const { user } = renderApp('/diagnostyka');
    expect(await main().findByText('Brak połączenia z usługą go2rtc.')).toBeInTheDocument();
    expect(main().getByText('Co 30 s')).toBeInTheDocument();
    expect(main().getByText('Bez połączenia: 1.')).toBeInTheDocument();
    const row = within(main().getByText('Wejście').closest('tr')!);
    expect(row.getByText('timeout')).toBeInTheDocument();
    expect(row.getByText('błąd rejestracji')).toBeInTheDocument();
    expect(row.getByText('nigdy')).toBeInTheDocument(); // brak udanego połączenia
    expect(within(main().getByText('NVR').closest('tr')!).getByText('8 ms')).toBeInTheDocument();

    await user.click(main().getByRole('button', { name: 'Sprawdź teraz' }));
    expect(await screen.findByText('Kontrola urządzeń zakończona.')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST' && call.path === '/api/v1/diagnostics/run')).toBe(true);
  });

  it('w trybie demonstracyjnym wyjaśnia, że diagnostyka wymaga Core', () => {
    renderApp('/diagnostyka');
    expect(screen.getByText('Diagnostyka wymaga połączenia z Sztudio Core')).toBeInTheDocument();
  });
});

describe('podgląd WebRTC', () => {
  it('odtwarza obraz przez Core, a po utracie połączenia sam łączy się ponownie', async () => {
    live();
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
    vi.stubGlobal('MediaStream', class { addTrack() {} });
    let failNext = true;
    const { calls } = stubCore({
      'GET /api/v1/cameras': () => ({ body: [CAMERA] }),
      'POST /api/v1/cameras/cam-1/webrtc': () => {
        if (failNext) {
          failNext = false;
          return { status: 502, body: { detail: { code: 'go2rtc_unavailable', message: 'Brak połączenia z usługą go2rtc.' } } };
        }
        return { text: 'v=0\r\nanswer\r\n' };
      },
    });
    renderApp('/kamery');
    const tile = await main().findByRole('article', { name: 'Kamera Wejście' });

    // 1. Core zgłasza błąd go2rtc – kafel pokazuje przyczynę i zapowiada ponowienie.
    await waitFor(() => expect(tile).toHaveAttribute('data-state', 'error'));
    expect(within(tile).getByText(/Brak połączenia z usługą go2rtc. Ponawiam automatycznie/)).toBeInTheDocument();
    const offer = calls.find((call) => call.path === '/api/v1/cameras/cam-1/webrtc')!;
    expect(offer.contentType).toBe('application/sdp');
    expect(offer.body).toBe('v=0\r\noffer\r\n');

    // 2. Automatyczne ponowienie po 2 s – tym razem z odpowiedzią SDP.
    await waitFor(() => expect(FakePeerConnection.instances.at(-1)?.remoteDescription?.sdp).toBe('v=0\r\nanswer\r\n'), { timeout: 4000 });
    act(() => FakePeerConnection.instances.at(-1)!.emitState('connected'));
    await waitFor(() => expect(tile).toHaveAttribute('data-state', 'live'));

    // 3. Przerwanie połączenia w trakcie odtwarzania – ponowne zestawienie bez udziału użytkownika.
    const before = FakePeerConnection.instances.length;
    act(() => FakePeerConnection.instances.at(-1)!.emitState('failed'));
    await waitFor(() => expect(tile).toHaveAttribute('data-state', 'error'));
    await waitFor(() => expect(FakePeerConnection.instances.length).toBeGreaterThan(before), { timeout: 4000 });
    act(() => FakePeerConnection.instances.at(-1)!.emitState('connected'));
    await waitFor(() => expect(tile).toHaveAttribute('data-state', 'live'));
  }, 15_000);
});
