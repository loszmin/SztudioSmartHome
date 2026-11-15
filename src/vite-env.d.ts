/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

interface ImportMetaEnv {
  readonly VITE_CORE_URL?: string;
  readonly VITE_DEFAULT_MODE?: string;
}
