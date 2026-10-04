'use client';

import type { CSSProperties } from 'react';
import type { Bridge } from '@/bridge/types';
import styles from './BookingFlow.module.scss';
import { STEP_TITLES, TEXTS } from './consts';
import { formatMoment, formatTime } from './format';
import { useBookingFlow } from './useBookingFlow';

export type BookingFlowProps = {
  bridge: Bridge;
};

const themeVariables = ({ colors }: Bridge['theme']): CSSProperties =>
  ({
    '--bg': colors.bg,
    '--text': colors.text,
    '--hint': colors.hint,
    '--link': colors.link,
    '--button': colors.button,
    '--button-text': colors.buttonText,
    '--secondary-bg': colors.secondaryBg,
  }) as CSSProperties;

export const BookingFlow = ({ bridge }: BookingFlowProps) => {
  const flow = useBookingFlow(bridge);
  const { catalog, loadStatus, step, selection, submitStatus } = flow;
  const service = catalog?.services.find(({ id }) => id === selection.serviceId);
  const master = catalog?.masters.find(({ id }) => id === selection.masterId);
  const masters = catalog?.masters.filter(({ services }) => service && services.includes(service.id)) ?? [];

  const renderMessage = (text: string, onRetry?: () => void) => (
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

  const renderBody = () => {
    if (loadStatus === 'loading') {
      return renderMessage(TEXTS.loading);
    }

    if (loadStatus === 'unauthorized') {
      return renderMessage(TEXTS.unauthorized);
    }

    if (loadStatus === 'network') {
      return renderMessage(TEXTS.network, flow.retryCatalog);
    }

    if (loadStatus === 'failed') {
      return renderMessage(TEXTS.loadFailed, flow.retryCatalog);
    }

    if (!catalog || catalog.services.length === 0) {
      return renderMessage(TEXTS.noServices);
    }

    return (
      <>
        {step !== 'service' && !(step === 'review' && submitStatus === 'done') && (
          <button
            type="button"
            className={styles.back}
            onClick={flow.goBack}
          >
            {TEXTS.back}
          </button>
        )}
        <h1 className={styles.title}>{STEP_TITLES[step]}</h1>
        {step === 'service' && (
          <ul className={styles.list}>
            {catalog.services.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.card}
                  onClick={() => flow.chooseService(item.id)}
                >
                  <span className={styles.name}>{item.name}</span>
                  <span className={styles.hint}>
                    {item.durationMin}&nbsp;{TEXTS.minutes}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {step === 'master' &&
          (masters.length === 0 ? (
            renderMessage(TEXTS.noMasters)
          ) : (
            <ul className={styles.list}>
              {masters.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={styles.card}
                    onClick={() => flow.chooseMaster(item.id)}
                  >
                    <span className={styles.name}>{item.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ))}
        {step === 'time' && (
          <>
            {flow.conflict && (
              <p
                className={styles.notice}
                role="alert"
              >
                {TEXTS.conflict}
              </p>
            )}
            <div className={styles.days}>
              {flow.days.map((day) => (
                <button
                  type="button"
                  key={day.date}
                  data-date={day.date}
                  aria-pressed={day.date === selection.date}
                  className={styles.day}
                  onClick={() => flow.chooseDate(day.date)}
                >
                  <span className={styles.hint}>{day.weekday}</span>
                  <span>{day.day}</span>
                </button>
              ))}
            </div>
            <p className={styles.hint}>{TEXTS.timeZoneNote}</p>
            {flow.slotsStatus === 'network' && renderMessage(TEXTS.network, flow.retrySlots)}
            {flow.slotsStatus === 'failed' && renderMessage(TEXTS.loadFailed, flow.retrySlots)}
            {flow.slotsStatus === 'ready' && flow.slots.length === 0 && renderMessage(TEXTS.noSlots)}
            {flow.slotsStatus === 'ready' && flow.slots.length > 0 && (
              <ul className={styles.slots}>
                {flow.slots.map((slot) => (
                  <li key={slot}>
                    <button
                      type="button"
                      className={styles.slot}
                      onClick={() => flow.chooseSlot(slot)}
                    >
                      {formatTime(slot, flow.timeZone)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {step === 'review' && (
          <>
            <dl className={styles.summary}>
              <dt>{TEXTS.service}</dt>
              <dd>{service?.name}</dd>
              <dt>{TEXTS.master}</dt>
              <dd>{master?.name}</dd>
              <dt>{TEXTS.when}</dt>
              <dd>{selection.startAt && formatMoment(selection.startAt, flow.timeZone)}</dd>
            </dl>
            {submitStatus === 'done' && (
              <p
                className={styles.success}
                role="status"
              >
                {TEXTS.done}
              </p>
            )}
            {submitStatus === 'failed' && renderMessage(TEXTS.bookingFailed)}
            {submitStatus === 'network' && renderMessage(TEXTS.network, flow.retrySubmit)}
          </>
        )}
      </>
    );
  };

  return (
    <main
      className={styles.root}
      data-scheme={bridge.theme.scheme}
      style={themeVariables(bridge.theme)}
    >
      {renderBody()}
    </main>
  );
};
