import type { Bridge } from '@/bridge/types';
import styles from './Loyalty.module.scss';
import { StampCard } from './StampCard';
import { StatusMessage } from './StatusMessage';
import { CARD_NOTICES, TEXTS } from './consts';
import type { GuestMe, Me } from './types';
import { useQrCard } from './useQrCard';

export type CardTabProps = {
  bridge: Bridge;
  me: GuestMe;
  active: boolean;
  onMe: (me: Me) => void;
};

export const CardTab = ({ bridge, me, active, onMe }: CardTabProps) => {
  const { image, failed, notice, retry } = useQrCard(bridge, me, active, onMe);

  return (
    <>
      <h1 className={styles.title}>{TEXTS.cardTitle}</h1>
      <StampCard
        stamps={me.stamps}
        perCoupon={me.stampsPerCoupon}
      />
      <section className={styles.block}>
        <h2 className={styles.subtitle}>{TEXTS.qrTitle}</h2>
        <p
          className={styles.notice}
          role="status"
          hidden={!notice}
        >
          {notice && CARD_NOTICES[notice]}
        </p>
        {failed ? (
          <StatusMessage
            text={TEXTS.qrFailed}
            onRetry={retry}
          />
        ) : (
          <div className={styles.qrFrame}>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- QR рисуется на клиенте в data URI, оптимизатору нечего делать
              <img
                className={styles.qr}
                src={image.src}
                alt={TEXTS.qrAlt}
                width={240}
                height={240}
              />
            ) : (
              <span className={styles.hint}>{TEXTS.loading}</span>
            )}
          </div>
        )}
        <p className={styles.hint}>{TEXTS.qrHint}</p>
      </section>
      {me.coupons.length > 0 && (
        <section className={styles.block}>
          <h2 className={styles.subtitle}>{TEXTS.couponsTitle}</h2>
          <ul className={styles.list}>
            {me.coupons.map((coupon) => (
              <li
                key={coupon.id}
                className={styles.coupon}
              >
                <span className={styles.name}>{TEXTS.giftLabel}</span>
                <span className={styles.hint}>{TEXTS.couponHint}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
};
