import type { Payload, PayloadRequest } from 'payload';
import type { Booking, Master, Service } from '../payload-types';
import { REQUEST_TIMEOUT_MS, SKIP_BOOKING_HOOKS } from './consts';
import { crmWebhookUrl } from './env';
import type { CrmEvent, CrmOutcome } from './types';

const populated = <T extends { id: number }>(value: number | T): T => {
  if (typeof value !== 'object') {
    throw new Error('связь записи не раскрыта: нужен depth 1');
  }

  return value;
};

/** Запись глубины 1 -> тело вебхука контракта. */
const buildBody = (booking: Booking, event: CrmEvent) => {
  const service: Service = populated(booking.service);
  const master: Master = populated(booking.master);

  return {
    event,
    bookingId: booking.id,
    service: { id: service.id, name: service.name },
    master: { id: master.id, name: master.name },
    startAt: new Date(booking.startAt).toISOString(),
    endAt: new Date(booking.endAt).toISOString(),
    platform: booking.platform,
  };
};

const postWebhook = async (url: string, body: unknown): Promise<CrmOutcome> => {
  if (!url) {
    return 'skipped';
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    return response.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
};

/** Шлет событие записи (`crmEvent`) в CRM и записывает итог; attempts - счетчик неудач до этой отправки. req - транзакция вызывающего хука. */
export const syncCrm = async (
  payload: Payload,
  booking: Booking,
  attempts: number,
  req?: PayloadRequest,
): Promise<void> => {
  const outcome = await postWebhook(crmWebhookUrl(), buildBody(booking, booking.crmEvent));

  await payload.update({
    collection: 'bookings',
    id: booking.id,
    data: { crmStatus: outcome, crmAttempts: outcome === 'failed' ? attempts + 1 : attempts },
    overrideAccess: true,
    context: { [SKIP_BOOKING_HOOKS]: true },
    req,
  });
};
