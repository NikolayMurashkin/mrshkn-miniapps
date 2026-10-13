import { useCallback, useEffect, useState } from 'react';
import type { Bridge } from '@/bridge/types';
import { changeOrderStatus, fetchStaffOrders } from './api';
import styles from './Loyalty.module.scss';
import { StatusMessage } from './StatusMessage';
import {
  DEFAULT_TIME_ZONE,
  ORDERS_POLL_MS,
  ORDER_STATUS_LABELS,
  ORDER_TRANSITIONS,
  PICKUP_LABELS,
  STATUS_ACTIONS,
  TEXTS,
} from './consts';
import { formatPrice, formatTime } from './format';
import type { ApiResult, LoadStatus, OrderStatus, StaffOrder, StaffOrders } from './types';

export type OrdersTabProps = {
  bridge: Bridge;
  active: boolean;
};

export const OrdersTab = ({ bridge, active }: OrdersTabProps) => {
  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [timeZone, setTimeZone] = useState<string>(DEFAULT_TIME_ZONE);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((result: ApiResult<StaffOrders>) => {
    if (result.kind === 'ok') {
      setOrders(result.data.orders);
      setTimeZone(result.data.timeZone);
      setStatus('ready');
    } else {
      setStatus(result.kind === 'unauthorized' || result.kind === 'network' ? result.kind : 'failed');
    }
  }, []);

  const load = useCallback(() => fetchStaffOrders(bridge).then(apply), [bridge, apply]);

  useEffect(() => {
    if (!active) {
      return;
    }

    fetchStaffOrders(bridge).then(apply);

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    }, ORDERS_POLL_MS);

    return () => window.clearInterval(timer);
  }, [active, bridge, apply, load]);

  const move = async (order: StaffOrder, next: OrderStatus) => {
    setPending(order.id);
    setError(null);

    const result = await changeOrderStatus(bridge, order.id, next);

    setPending(null);

    if (result.kind === 'conflict' || result.kind === 'not-found') {
      setError(TEXTS.statusConflict);
    } else if (result.kind !== 'ok') {
      setError(TEXTS.statusFailed);
    }

    await load();
  };

  const renderBody = () => {
    if (status === 'loading') {
      return <StatusMessage text={TEXTS.loading} />;
    }

    if (status === 'unauthorized') {
      return <StatusMessage text={TEXTS.unauthorized} />;
    }

    if (status !== 'ready') {
      return (
        <StatusMessage
          text={status === 'network' ? TEXTS.network : TEXTS.loadFailed}
          onRetry={() => void load()}
        />
      );
    }

    if (orders.length === 0) {
      return <StatusMessage text={TEXTS.ordersEmpty} />;
    }

    return (
      <ul className={styles.list}>
        {orders.map((order) => (
          <li
            key={order.id}
            className={styles.orderCard}
          >
            <div className={styles.orderHead}>
              <span className={styles.name}>
                {TEXTS.orderNumber}
                {order.id}
              </span>
              <span
                className={styles.badge}
                data-status={order.status}
              >
                {ORDER_STATUS_LABELS[order.status]}
              </span>
            </div>
            <span className={styles.guestName}>{order.guest.name}</span>
            <span className={styles.hint}>
              {PICKUP_LABELS[order.pickup]}
              {order.pickupAt && `, ${TEXTS.pickupBy}\u00a0${formatTime(order.pickupAt, timeZone)}`}
            </span>
            <ul className={styles.orderLines}>
              {order.items.map((line, index) => (
                <li key={`${line.name}-${index}`}>
                  {line.name} × {line.qty}
                </li>
              ))}
            </ul>
            <p className={styles.cartTotal}>
              <span>{TEXTS.total}</span>
              <span>{formatPrice(order.total)}</span>
            </p>
            <div className={styles.orderActions}>
              {ORDER_TRANSITIONS[order.status].map((next) => (
                <button
                  key={next}
                  type="button"
                  className={styles.action}
                  data-variant={next === 'cancelled' ? 'quiet' : undefined}
                  disabled={pending !== null}
                  onClick={() => void move(order, next)}
                >
                  {STATUS_ACTIONS[next]}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <>
      <h1 className={styles.title}>{TEXTS.ordersTitle}</h1>
      {error && (
        <p
          className={styles.notice}
          role="alert"
        >
          {error}
        </p>
      )}
      {renderBody()}
    </>
  );
};
