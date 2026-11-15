import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/stores/settingsStore';
import { renderApp } from '@/test/renderApp';

const mainNav = () => within(screen.getByRole('navigation', { name: 'Nawigacja główna' }));
const main = () => within(screen.getByRole('main'));

describe('nawigacja i dashboard', () => {
  it('dashboard pokazuje statusy, kamery, alarmy i zdarzenia', async () => {
    renderApp('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Centrum monitoringu' })).toBeInTheDocument();
    expect(await main().findByText('7 / 8')).toBeInTheDocument();
    expect(main().getByRole('heading', { name: 'Podgląd kamer' })).toBeInTheDocument();
    expect(main().getByRole('heading', { name: 'Aktywne alarmy' })).toBeInTheDocument();
    expect(main().getByRole('heading', { name: 'Ostatnie zdarzenia' })).toBeInTheDocument();
    expect(await main().findAllByRole('article', { name: /^Kamera / })).toHaveLength(4);
  });

  it('panel boczny prowadzi do wszystkich ekranów', async () => {
    const { user } = renderApp('/');
    const screens: Array<[string, string]> = [
      ['Kamery', 'Monitoring kamer'],
      ['Alarmy', 'Alarmy'],
      ['Czujniki', 'Czujniki'],
      ['Sieć', 'Sieć lokalna'],
      ['Historia', 'Historia zdarzeń'],
      ['Ustawienia', 'Ustawienia'],
      ['Start', 'Centrum monitoringu'],
    ];
    for (const [link, title] of screens) {
      await user.click(mainNav().getByRole('link', { name: new RegExp(`^${link}`) }));
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    }
  });

  it('nieznany adres pokazuje stronę błędu', () => {
    renderApp('/nie-ma');
    expect(screen.getByText('Nie znaleziono strony')).toBeInTheDocument();
  });
});

describe('monitoring kamer', () => {
  it('przełącza układy i powiększa wybraną kamerę', async () => {
    const { user } = renderApp('/kamery');
    expect(await main().findAllByRole('article')).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: 'Widok 9 kamer' }));
    expect(main().getAllByRole('article')).toHaveLength(8);
    expect(main().getAllByText('Wolny slot')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Widok 1 kamery' }));
    expect(main().getAllByRole('article')).toHaveLength(1);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Wybór kamery' }), 'cam-03');
    expect(main().getByRole('article', { name: 'Kamera Ogród' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Następna kamera' }));
    expect(main().getByRole('article', { name: 'Kamera Garaż' })).toBeInTheDocument();

    // Powrót do ostatnio używanej siatki (9 slotów, 8 kamer).
    await user.click(screen.getByRole('button', { name: 'Wróć do siatki' }));
    expect(main().getAllByRole('article')).toHaveLength(8);
  });
});

describe('alarmy', () => {
  it('potwierdzenie alarmu przenosi go do historii', async () => {
    const { user } = renderApp('/alarmy');
    const alarm = await main().findByRole('article', { name: 'Utrata połączenia z kamerą' });
    expect(main().getByRole('button', { name: 'Aktywne (3)' })).toBeInTheDocument();

    await user.click(within(alarm).getByRole('button', { name: 'Potwierdź' }));
    expect(await main().findByRole('button', { name: 'Aktywne (2)' })).toBeInTheDocument();
    expect(main().queryByRole('article', { name: 'Utrata połączenia z kamerą' })).not.toBeInTheDocument();
    expect(await screen.findByText('Alarm został potwierdzony.')).toBeInTheDocument();

    await user.click(main().getByRole('button', { name: 'Historia' }));
    const archived = main().getByRole('article', { name: 'Utrata połączenia z kamerą' });
    expect(within(archived).getByText('Potwierdzony')).toBeInTheDocument();
  });

  it('zmienia tryb uzbrojenia systemu', async () => {
    const { user } = renderApp('/alarmy');
    expect(await main().findByTestId('arming-state')).toHaveTextContent('Uzbrojony – tryb domowy');
    await user.click(main().getByRole('button', { name: 'Rozbrojony' }));
    await waitFor(() => expect(main().getByTestId('arming-state')).toHaveTextContent('Rozbrojony'));
  });
});

describe('czujniki, sieć, historia', () => {
  it('filtruje czujniki według kategorii', async () => {
    const { user } = renderApp('/czujniki');
    expect(await main().findAllByRole('article')).toHaveLength(16);
    await user.click(main().getByRole('button', { name: 'Zalanie (2)' }));
    const cards = main().getAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('Sucho');
  });

  it('wyszukuje urządzenia sieciowe', async () => {
    const { user } = renderApp('/siec');
    await main().findAllByText('Rejestrator BCS');
    await user.type(main().getByRole('searchbox', { name: 'Szukaj urządzenia' }), 'mikrotik');
    const table = main().getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('192.168.1.1')).toBeInTheDocument();

    await user.clear(main().getByRole('searchbox'));
    await user.type(main().getByRole('searchbox'), 'zzz');
    expect(main().getByText('Brak urządzeń spełniających kryteria')).toBeInTheDocument();
  });

  it('filtruje historię według kategorii i daty', async () => {
    const { user } = renderApp('/historia');
    expect((await main().findAllByRole('listitem')).length).toBeGreaterThan(20);

    await user.selectOptions(main().getByLabelText('Kategoria'), 'restart');
    await waitFor(() => expect(main().getAllByRole('listitem')).toHaveLength(3));

    // Zakres z przyszłości nie zawiera żadnych zdarzeń.
    await user.type(main().getByLabelText('Od dnia'), '2099-01-01');
    expect(await main().findByText('Brak zdarzeń dla wybranych filtrów')).toBeInTheDocument();

    await user.click(main().getAllByRole('button', { name: 'Wyczyść filtry' })[0]!);
    await waitFor(() => expect(main().getAllByRole('listitem').length).toBeGreaterThan(20));
  });
});

describe('brak serwera', () => {
  it('pokazuje stan braku połączenia i wznawia pracę po powrocie serwera', async () => {
    useSettingsStore.setState({ mode: 'live', serverUrl: 'http://core.test:8000' });
    const fetchMock = vi.fn(async (_url: string) => Promise.reject<Response>(new TypeError('Failed to fetch')));
    vi.stubGlobal('fetch', fetchMock);

    const { user } = renderApp('/');
    const banner = await screen.findByText('Brak połączenia z Sztudio Core.');
    expect(banner.closest('[role="alert"]')).toHaveTextContent('Serwer jest nieosiągalny');
    expect(await main().findAllByText('Nie udało się pobrać danych')).not.toHaveLength(0);
    expect(fetchMock.mock.calls.some(([url]) => url === 'http://core.test:8000/api/v1/system/status')).toBe(true);

    // Serwer wraca – odpowiada pustymi listami i poprawnym statusem.
    fetchMock.mockImplementation(async (url: string) => {
      const body = url.endsWith('/system/status')
        ? {
            core: { state: 'online', version: '1.2.3', hostname: 'core', uptimeSeconds: 60 },
            resources: { cpuPercent: 1, memoryPercent: 2, diskPercent: 3 },
            services: [],
            alarmSystem: { mode: 'disarmed', changedAt: new Date().toISOString() },
            serverTime: new Date().toISOString(),
          }
        : [];
      return new Response(JSON.stringify(body), { status: 200 });
    });
    await user.click(screen.getByRole('button', { name: 'Połącz ponownie' }));
    await waitFor(() => expect(screen.queryByText('Brak połączenia z Sztudio Core.')).not.toBeInTheDocument());
    await user.click(main().getAllByRole('button', { name: 'Spróbuj ponownie' })[0]!);
    expect(await main().findByText('Brak kamer')).toBeInTheDocument();
  });
});

describe('ustawienia', () => {
  it('waliduje i zapisuje adres serwera', async () => {
    const { user } = renderApp('/ustawienia');
    const section = within(screen.getByRole('region', { name: 'Połączenie z Sztudio Core' }));
    const address = section.getByLabelText('Adres serwera');

    await user.click(section.getByRole('button', { name: 'Sztudio Core' }));
    await user.type(address, 'serwer-bez-protokolu');
    expect(section.getByText(/Podaj pełny adres/)).toBeInTheDocument();
    expect(section.getByRole('button', { name: 'Zapisz' })).toBeDisabled();

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await user.clear(address);
    await user.type(address, 'http://core.test:8000/');
    await user.click(section.getByRole('button', { name: 'Zapisz' }));

    expect(useSettingsStore.getState()).toMatchObject({ mode: 'live', serverUrl: 'http://core.test:8000' });
    expect(JSON.parse(localStorage.getItem('sztudio.settings')!).state.serverUrl).toBe('http://core.test:8000');
  });

  it('test połączenia zgłasza niedostępny serwer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const { user } = renderApp('/ustawienia');
    const section = within(screen.getByRole('region', { name: 'Połączenie z Sztudio Core' }));
    await user.type(section.getByLabelText('Adres serwera'), 'http://core.test:8000');
    await user.click(section.getByRole('button', { name: 'Testuj połączenie' }));
    expect(await section.findByRole('status')).toHaveTextContent('Serwer jest nieosiągalny');
  });
});

describe('logowanie do Sztudio Core', () => {
  const statusBody = {
    core: { state: 'online', version: '1.0.0', hostname: 'core', uptimeSeconds: 60 },
    resources: { cpuPercent: 1, memoryPercent: 2, diskPercent: 3 },
    services: [],
    alarmSystem: { mode: 'disarmed', changedAt: new Date().toISOString() },
    serverTime: new Date().toISOString(),
  };

  /** Serwer wymagający tokenu „dobry-token”; logowanie przyjmuje admin / tajne-haslo. */
  function stubSecuredServer() {
    const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
      const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
      if (url.endsWith('/api/v1/auth/login')) {
        const body = JSON.parse(String(init.body)) as { username: string; password: string };
        return body.username === 'admin' && body.password === 'tajne-haslo'
          ? reply({ accessToken: 'dobry-token', tokenType: 'bearer', expiresAt: new Date().toISOString(), user: { id: 'u1', username: 'admin', role: 'admin' } })
          : reply({ detail: 'Nieprawidłowy login lub hasło.' }, 401);
      }
      const authorized = (init.headers as Record<string, string>).Authorization === 'Bearer dobry-token';
      if (!authorized) return reply({ detail: 'Wymagane uwierzytelnienie.' }, 401);
      return reply(url.endsWith('/system/status') ? statusBody : []);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('bez tokenu pokazuje wezwanie do zalogowania, a po zalogowaniu pobiera dane', async () => {
    useSettingsStore.setState({ mode: 'live', serverUrl: 'http://core.test:8000' });
    stubSecuredServer();
    const { user } = renderApp('/ustawienia');

    expect(await screen.findByText('Sztudio Core wymaga zalogowania.')).toBeInTheDocument();
    const form = within(screen.getByRole('form', { name: 'Logowanie do Sztudio Core' }));

    await user.type(form.getByLabelText('Login'), 'admin');
    await user.type(form.getByLabelText('Hasło'), 'zle-haslo');
    await user.click(form.getByRole('button', { name: 'Zaloguj' }));
    expect(await form.findByRole('alert')).toHaveTextContent('Nieprawidłowy login lub hasło.');
    expect(useSettingsStore.getState().apiToken).toBe('');

    await user.clear(form.getByLabelText('Hasło'));
    await user.type(form.getByLabelText('Hasło'), 'tajne-haslo');
    await user.click(form.getByRole('button', { name: 'Zaloguj' }));

    expect(await main().findByText(/Zalogowano jako/)).toBeInTheDocument();
    expect(useSettingsStore.getState()).toMatchObject({ apiToken: 'dobry-token', authUsername: 'admin' });
    await waitFor(() => expect(screen.queryByText('Sztudio Core wymaga zalogowania.')).not.toBeInTheDocument());

    await user.click(main().getByRole('button', { name: 'Wyloguj' }));
    expect(useSettingsStore.getState().apiToken).toBe('');
    expect(screen.getByRole('form', { name: 'Logowanie do Sztudio Core' })).toBeInTheDocument();
  });

  it('obsługuje urządzenia, które nigdy nie były widziane (lastSeenAt: null)', async () => {
    useSettingsStore.setState({ mode: 'live', serverUrl: 'http://core.test:8000', apiToken: 'dobry-token' });
    const fetchMock = stubSecuredServer();
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      url.endsWith('/network/devices')
        ? new Response(JSON.stringify([{ id: 'n1', name: 'Router', type: 'router', ipAddress: '10.0.0.1', vendor: '', status: 'offline', lastSeenAt: null }]))
        : base(url, init),
    );
    renderApp('/siec');
    const row = (await within(await main().findByRole('table')).findAllByText('Router'))[0]!.closest('tr')!;
    expect(within(row).getByText('nigdy')).toBeInTheDocument();
  });
});
