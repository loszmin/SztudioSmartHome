import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { resetCoreApiCache } from '@/services/coreApiProvider';
import { defaultSettings, useSettingsStore } from '@/stores/settingsStore';
import { useToastStore } from '@/stores/toastStore';

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
}
Element.prototype.scrollTo ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({ ...defaultSettings, mode: 'demo', serverUrl: '', apiToken: '' });
  useToastStore.setState({ toasts: [] });
  resetCoreApiCache();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
