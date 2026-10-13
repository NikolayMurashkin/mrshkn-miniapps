import { useCallback, useEffect, useState } from 'react';
import type { Bridge } from '@/bridge/types';
import { fetchMe } from './api';
import type { LoadStatus, Me } from './types';

/** Роль и карта гостя из первого запроса; экран QR потом обновляет карту через setMe. */
export const useLoyaltyMe = (bridge: Bridge) => {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchMe(bridge).then((result) => {
      if (cancelled) {
        return;
      }

      if (result.kind === 'ok') {
        setMe(result.data);
        setStatus('ready');
      } else {
        setStatus(result.kind === 'unauthorized' || result.kind === 'network' ? result.kind : 'failed');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [bridge, attempt]);

  const retry = useCallback(() => {
    setStatus('loading');
    setAttempt((value) => value + 1);
  }, []);

  return { me, status, setMe, retry };
};
