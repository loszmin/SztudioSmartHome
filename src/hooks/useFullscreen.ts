import { useCallback, useEffect, useState, type RefObject } from 'react';

/** Obsługa trybu pełnoekranowego dla wskazanego elementu. */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const supported = typeof document !== 'undefined' && document.fullscreenEnabled === true;

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === ref.current && ref.current !== null);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [ref]);

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await ref.current?.requestFullscreen();
    } catch {
      // Przeglądarka odmówiła przejścia w tryb pełnoekranowy – brak akcji.
    }
  }, [ref]);

  return { isFullscreen, toggle, supported };
}
