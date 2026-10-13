import { useState } from 'react';
import type { Bridge } from '@/bridge/types';
import { redeemCoupon, scanGuestQr } from './api';
import styles from './Loyalty.module.scss';
import { StampCard } from './StampCard';
import { REDEEM_ERRORS, SCAN_ERRORS, STAMPS_PER_COUPON, TEXTS } from './consts';
import type { ScanResult } from './types';

export type ScannerTabProps = {
  bridge: Bridge;
};

export const ScannerTab = ({ bridge }: ScannerTabProps) => {
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState<number | null>(null);

  const startScan = async () => {
    setScanning(true);
    setError(null);
    setNotice(null);

    const qrToken = await bridge.scanQr();

    if (!qrToken) {
      setScanning(false);

      return;
    }

    const result = await scanGuestQr(bridge, qrToken);

    setScanning(false);

    if (result.kind === 'ok') {
      setScan(result.data);
    } else {
      setScan(null);
      setError(SCAN_ERRORS[result.kind] ?? TEXTS.scanFailed);
    }
  };

  const redeem = async (id: number) => {
    setRedeeming(id);
    setError(null);

    const result = await redeemCoupon(bridge, id);

    setRedeeming(null);

    if (result.kind === 'ok' || result.kind === 'conflict') {
      setScan((current) => current && { ...current, coupons: current.coupons.filter((coupon) => coupon.id !== id) });
    }

    if (result.kind === 'ok') {
      setNotice(TEXTS.redeemed);
    } else {
      setError(REDEEM_ERRORS[result.kind] ?? TEXTS.redeemFailed);
    }
  };

  return (
    <>
      <h1 className={styles.title}>{TEXTS.scannerTitle}</h1>
      <p className={styles.lead}>{TEXTS.scannerHint}</p>
      <button
        type="button"
        className={`${styles.action} ${styles.wide}`}
        disabled={scanning}
        onClick={() => void startScan()}
      >
        {scanning ? TEXTS.scanning : TEXTS.scan}
      </button>
      {error && (
        <p
          className={styles.notice}
          role="alert"
        >
          {error}
        </p>
      )}
      {scan && (
        <section className={`${styles.block} ${styles.guestCard}`}>
          <h2 className={styles.subtitle}>{scan.guest.name}</h2>
          <p
            className={styles.scanResult}
            data-result={scan.result}
            role="status"
          >
            {scan.result === 'accrued' ? TEXTS.accrued : TEXTS.duplicate}
          </p>
          {scan.couponIssued && <p className={styles.success}>{TEXTS.couponIssued}</p>}
          <StampCard
            stamps={scan.stamps}
            perCoupon={STAMPS_PER_COUPON}
          />
          {scan.coupons.length > 0 && (
            <ul className={styles.list}>
              {scan.coupons.map((coupon) => (
                <li
                  key={coupon.id}
                  className={styles.coupon}
                >
                  <span className={styles.name}>{TEXTS.giftLabel}</span>
                  <button
                    type="button"
                    className={styles.action}
                    disabled={redeeming !== null}
                    onClick={() => void redeem(coupon.id)}
                  >
                    {TEXTS.redeem}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {notice && (
            <p
              className={styles.success}
              role="status"
            >
              {notice}
            </p>
          )}
        </section>
      )}
    </>
  );
};
