import styles from './Loyalty.module.scss';
import { STAMP_WORDS, TEXTS } from './consts';
import { plural } from './format';

export type StampCardProps = {
  stamps: number;
  perCoupon: number;
};

const CupIcon = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={styles.cupIcon}
  >
    <path d="M4 8h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6V8Zm13 1h1.5a2.5 2.5 0 0 1 0 5H17M7 3.5c0 1 1 1.2 1 2.2M11 3.5c0 1 1 1.2 1 2.2" />
  </svg>
);

/** Карта на perCoupon ячеек: штампы заполняют первые, последняя — подарок. */
export const StampCard = ({ stamps, perCoupon }: StampCardProps) => {
  const left = perCoupon - stamps;
  const cells = Array.from({ length: perCoupon - 1 }, (_, index) => index < stamps);

  return (
    <figure className={styles.stampCard}>
      <div
        className={styles.stampGrid}
        aria-hidden="true"
      >
        {cells.map((filled, index) => (
          <span
            key={index}
            className={styles.stampCell}
            data-filled={filled}
          />
        ))}
        <span className={`${styles.stampCell} ${styles.giftCell}`}>
          <CupIcon />
        </span>
      </div>
      <figcaption className={styles.stampCaption}>
        <span className={styles.stampCount}>
          {stamps} {TEXTS.stampsOf}&nbsp;{perCoupon}
        </span>
        <span className={styles.hint}>
          {left === 1 ? TEXTS.nextIsGift : `${TEXTS.more} ${left} ${plural(left, STAMP_WORDS)} ${TEXTS.untilGift}`}
        </span>
      </figcaption>
    </figure>
  );
};
