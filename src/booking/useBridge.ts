import { useEffect, useState } from 'react';
import type { Bridge } from '@/bridge/types';

/** Адаптер создается на клиенте после монтирования: на сервере нет ни window, ни платформы. */
export const useBridge = (load: () => Promise<Bridge>): Bridge | null => {
  const [bridge, setBridge] = useState<Bridge | null>(null);

  useEffect(() => {
    let cancelled = false;

    load().then((loaded) => {
      if (!cancelled) {
        setBridge(loaded);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [load]);

  return bridge;
};
