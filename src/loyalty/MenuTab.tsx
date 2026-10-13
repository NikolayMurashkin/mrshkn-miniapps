import type { Bridge } from '@/bridge/types';
import styles from './Loyalty.module.scss';
import { StatusMessage } from './StatusMessage';
import { cartTotal } from './cart';
import {
  MAX_QTY,
  MENU_CATEGORIES,
  MENU_CATEGORY_LABELS,
  OPEN_ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  PICKUP_LABELS,
  PICKUP_OPTIONS,
  TEXTS,
} from './consts';
import { formatPrice } from './format';
import { useOrderFlow } from './useOrderFlow';

export type MenuTabProps = {
  bridge: Bridge;
  active: boolean;
};

export const MenuTab = ({ bridge, active }: MenuTabProps) => {
  const flow = useOrderFlow(bridge, active);
  const { items, cart, status, submitStatus } = flow;

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
        onRetry={flow.retry}
      />
    );
  }

  if (submitStatus === 'done' && flow.placedId !== null) {
    return (
      <div className={styles.accepted}>
        <h1 className={styles.title}>{TEXTS.orderAccepted}</h1>
        <p className={styles.acceptedNumber}>
          {TEXTS.orderNumber}
          {flow.placedId}
        </p>
        <p className={styles.hint}>{TEXTS.orderAcceptedHint}</p>
        <button
          type="button"
          className={styles.action}
          onClick={flow.backToMenu}
        >
          {TEXTS.backToMenu}
        </button>
      </div>
    );
  }

  const openOrders = flow.orders.filter((order) => OPEN_ORDER_STATUSES.some((status) => status === order.status));
  const cartItems = items.filter((item) => (cart[String(item.id)] ?? 0) > 0);
  const sections = MENU_CATEGORIES.map((category) => ({
    category,
    items: items.filter((item) => item.category === category),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      <h1 className={styles.title}>{TEXTS.menuTitle}</h1>
      {openOrders.length > 0 && (
        <section className={styles.block}>
          <h2 className={styles.subtitle}>{TEXTS.myOrdersTitle}</h2>
          <ul className={styles.list}>
            {openOrders.map((order) => (
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
                <span className={styles.hint}>
                  {order.items.map((line) => `${line.name} × ${line.qty}`).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {sections.length === 0 && <StatusMessage text={TEXTS.emptyMenu} />}
      {sections.map((section) => (
        <section
          key={section.category}
          className={styles.block}
        >
          <h2 className={styles.subtitle}>{MENU_CATEGORY_LABELS[section.category]}</h2>
          <ul className={styles.list}>
            {section.items.map((item) => {
              const id = String(item.id);
              const qty = cart[id] ?? 0;

              return (
                <li
                  key={id}
                  className={styles.menuItem}
                >
                  <div className={styles.menuText}>
                    <span className={styles.name}>{item.name}</span>
                    {item.description && <span className={styles.hint}>{item.description}</span>}
                    <span className={styles.price}>{formatPrice(item.price)}</span>
                  </div>
                  <div className={styles.stepper}>
                    {qty > 0 && (
                      <>
                        <button
                          type="button"
                          className={styles.stepButton}
                          aria-label={`${TEXTS.remove} «${item.name}»`}
                          onClick={() => flow.remove(id)}
                        >
                          −
                        </button>
                        <span
                          className={styles.qty}
                          aria-live="polite"
                        >
                          {qty}
                        </span>
                      </>
                    )}
                    <button
                      type="button"
                      className={styles.stepButton}
                      data-primary={qty === 0}
                      aria-label={`${TEXTS.add} «${item.name}»`}
                      disabled={qty >= MAX_QTY}
                      onClick={() => flow.add(id)}
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {cartItems.length > 0 && (
        <section className={`${styles.block} ${styles.cart}`}>
          <h2 className={styles.subtitle}>{TEXTS.cartTitle}</h2>
          <ul className={styles.cartLines}>
            {cartItems.map((item) => {
              const qty = cart[String(item.id)] ?? 0;

              return (
                <li key={item.id}>
                  <span className={styles.lineName}>
                    {item.name} × {qty}
                  </span>
                  <span>{formatPrice(item.price * qty)}</span>
                </li>
              );
            })}
          </ul>
          <p className={styles.cartTotal}>
            <span>{TEXTS.total}</span>
            <span>{formatPrice(cartTotal(cart, items))}</span>
          </p>
          <fieldset className={styles.pickup}>
            <legend className={styles.legend}>{TEXTS.pickupLegend}</legend>
            {PICKUP_OPTIONS.map((option) => (
              <label
                key={option}
                className={styles.radio}
              >
                <input
                  type="radio"
                  name="pickup"
                  value={option}
                  checked={flow.pickup === option}
                  onChange={() => flow.choosePickup(option)}
                />
                <span>{PICKUP_LABELS[option]}</span>
              </label>
            ))}
          </fieldset>
          <p className={styles.hint}>{TEXTS.payAtCounter}</p>
        </section>
      )}
      {submitStatus === 'conflict' && (
        <p
          className={styles.notice}
          role="alert"
        >
          {TEXTS.orderConflict}
        </p>
      )}
      {submitStatus === 'failed' && (
        <p
          className={styles.notice}
          role="alert"
        >
          {TEXTS.orderFailed}
        </p>
      )}
      {submitStatus === 'network' && (
        <StatusMessage
          text={TEXTS.network}
          onRetry={flow.retrySubmit}
        />
      )}
    </>
  );
};
