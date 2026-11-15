import { createHttpCoreApi, type SztudioCoreApi } from './api/coreApi';
import { createDemoApi } from './mock/demoApi';
import { normalizeUrl, useSettingsStore, type DataMode } from '@/stores/settingsStore';

export interface DataSource {
  mode: DataMode;
  serverUrl: string;
  apiToken: string;
}

let demoApi: SztudioCoreApi | null = null;
let liveApi: { key: string; api: SztudioCoreApi } | null = null;

/** Zwraca implementację API odpowiednią dla bieżącego źródła danych. */
export function getCoreApi(source: DataSource = currentDataSource()): SztudioCoreApi {
  if (source.mode === 'demo') {
    demoApi ??= createDemoApi();
    return demoApi;
  }
  const baseUrl = normalizeUrl(source.serverUrl);
  const key = `${baseUrl}|${source.apiToken}`;
  if (liveApi?.key !== key) {
    liveApi = { key, api: createHttpCoreApi({ baseUrl, token: source.apiToken || undefined }) };
  }
  return liveApi.api;
}

export function currentDataSource(): DataSource {
  const { mode, serverUrl, apiToken } = useSettingsStore.getState();
  return { mode, serverUrl, apiToken };
}

/** Tylko dla testów – resetuje stan danych demonstracyjnych. */
export function resetCoreApiCache(): void {
  demoApi = null;
  liveApi = null;
}
