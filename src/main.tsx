import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { PwaUpdatePrompt } from '@/app/PwaUpdatePrompt';
import { initPwaInstallListeners } from '@/stores/pwaStore';
import '@/styles/index.css';

initPwaInstallListeners();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PwaUpdatePrompt />
  </StrictMode>,
);
