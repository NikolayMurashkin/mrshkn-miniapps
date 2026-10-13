import QRCode from 'qrcode';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bridge } from '@/bridge/types';
import { fetchMe, issueQr } from './api';
import { noticeFor } from './card-notice';
import { QR_POLL_MS } from './consts';
import type { ApiResult, CardNotice, GuestMe, Me, QrImage, QrTicket } from './types';

const toImage = async (qrToken: string, expiresAt: string): Promise<QrImage> => {
  const svg = await QRCode.toString(qrToken, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });

  return {
    token: qrToken,
    expiresAt: Date.parse(expiresAt),
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  };
};

/**
 * QR гостя на экране карты: пока вкладка открыта и видна, карта опрашивается раз в секунду. Штамп или купон
 * изменились — кассир отсканировал код: показываем, что случилось, и выдаем новый одноразовый QR; истек — тоже новый.
 */
export const useQrCard = (bridge: Bridge, me: GuestMe, active: boolean, onMe: (me: Me) => void) => {
  const [image, setImage] = useState<QrImage | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<CardNotice | null>(null);
  const meRef = useRef(me);
  const busyRef = useRef(false);

  useEffect(() => {
    meRef.current = me;
  }, [me]);

  const applyTicket = useCallback(async (result: ApiResult<QrTicket>) => {
    if (result.kind !== 'ok') {
      setFailed(true);

      return;
    }

    const next = await toImage(result.data.qrToken, result.data.expiresAt);

    setFailed(false);
    setImage(next);
  }, []);

  const refreshQr = useCallback(() => issueQr(bridge).then(applyTicket), [bridge, applyTicket]);

  useEffect(() => {
    if (active && !image && !failed) {
      issueQr(bridge).then(applyTicket);
    }
  }, [active, image, failed, bridge, applyTicket]);

  useEffect(() => {
    if (!active || !image) {
      return;
    }

    const poll = async () => {
      if (busyRef.current || document.visibilityState !== 'visible') {
        return;
      }

      busyRef.current = true;

      try {
        if (Date.now() >= image.expiresAt) {
          await refreshQr();

          return;
        }

        const result = await fetchMe(bridge);

        if (result.kind !== 'ok' || result.data.role !== 'guest') {
          return;
        }

        const change = noticeFor(meRef.current, result.data);

        if (change) {
          onMe(result.data);
          setNotice(change);
          await refreshQr();
        }
      } finally {
        busyRef.current = false;
      }
    };

    const timer = window.setInterval(() => void poll(), QR_POLL_MS);

    return () => window.clearInterval(timer);
  }, [active, image, bridge, onMe, refreshQr]);

  const retry = () => {
    setFailed(false);
  };

  return { image, failed, notice, retry };
};
