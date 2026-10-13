import styles from './Loyalty.module.scss';
import { TEXTS } from './consts';

export type StatusMessageProps = {
  text: string;
  onRetry?: () => void;
};

export const StatusMessage = ({ text, onRetry }: StatusMessageProps) => (
  <div
    className={styles.message}
    role="status"
  >
    <p>{text}</p>
    {onRetry && (
      <button
        type="button"
        className={styles.action}
        onClick={onRetry}
      >
        {TEXTS.retry}
      </button>
    )}
  </div>
);
