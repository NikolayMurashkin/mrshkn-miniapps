import type { Payload } from 'payload';
import type { Booking, Reminder } from '../payload-types';
import { loadSettings } from '../lib/booking';
import { CRM_MAX_ATTEMPTS, REMINDER_MAX_ATTEMPTS } from '../lib/consts';
import { syncCrm } from '../lib/crm';
import { reminderText } from '../lib/messages';
import { sendToClient } from '../lib/messenger';

const bookingIdOf = (reminder: Reminder): number =>
  typeof reminder.booking === 'object' ? reminder.booking.id : reminder.booking;

const setReminder = (payload: Payload, id: number, data: Partial<Reminder>): Promise<unknown> =>
  payload.update({ collection: 'reminders', id, data, overrideAccess: true });

const deliverReminder = async (payload: Payload, reminder: Reminder, now: Date, timeZone: string): Promise<void> => {
  const booking = reminder.booking;

  if (typeof booking !== 'object' || typeof booking.client !== 'object') {
    throw new Error(`напоминание ${reminder.id}: связи записи не раскрыты`);
  }

  const startAt = new Date(booking.startAt);

  if (booking.status !== 'active' || startAt.getTime() <= now.getTime()) {
    await setReminder(payload, reminder.id, { status: 'cancelled' });

    return;
  }

  const { service, master, client } = booking;

  if (typeof service !== 'object' || typeof master !== 'object') {
    throw new Error(`напоминание ${reminder.id}: услуга или мастер не раскрыты`);
  }

  const delivered = await sendToClient(
    client.platform,
    client.platformUserId,
    reminderText({ serviceName: service.name, masterName: master.name, startAt, timeZone }),
  );

  if (delivered) {
    await setReminder(payload, reminder.id, { status: 'sent' });

    return;
  }

  const attempts = reminder.attempts + 1;

  payload.logger.warn({ msg: `напоминание ${reminder.id} не доставлено, попытка ${attempts}` });
  await setReminder(payload, reminder.id, {
    attempts,
    status: attempts >= REMINDER_MAX_ATTEMPTS ? 'failed' : 'pending',
  });
};

/** Созрели оба напоминания записи - уходит только `2h`, `24h` отменяется. */
const sendDueReminders = async (payload: Payload, now: Date): Promise<void> => {
  const { timeZone } = await loadSettings(payload);
  const { docs } = await payload.find({
    collection: 'reminders',
    where: { and: [{ status: { equals: 'pending' } }, { sendAt: { less_than_equal: now.toISOString() } }] },
    depth: 2,
    pagination: false,
    sort: 'sendAt',
    overrideAccess: true,
  });
  const supersededIds = new Set(
    docs
      .filter((reminder) => reminder.kind === '24h')
      .filter((reminder) => docs.some((other) => other.kind === '2h' && bookingIdOf(other) === bookingIdOf(reminder)))
      .map((reminder) => reminder.id),
  );

  for (const reminder of docs) {
    if (supersededIds.has(reminder.id)) {
      await setReminder(payload, reminder.id, { status: 'cancelled' });
    } else {
      await deliverReminder(payload, reminder, now, timeZone);
    }
  }
};

const retryFailedCrm = async (payload: Payload): Promise<void> => {
  const { docs } = await payload.find({
    collection: 'bookings',
    where: { and: [{ crmStatus: { equals: 'failed' } }, { crmAttempts: { less_than: CRM_MAX_ATTEMPTS } }] },
    depth: 1,
    pagination: false,
    overrideAccess: true,
  });

  for (const booking of docs satisfies Booking[]) {
    await syncCrm(payload, booking, booking.crmAttempts);
  }
};

/** Один проход задачи раз в минуту: созревшие напоминания и повтор упавших вебхуков CRM. Сбой одной части не блокирует другую. */
export const runTick = async (payload: Payload, now: Date): Promise<void> => {
  const results = await Promise.allSettled([sendDueReminders(payload, now), retryFailedCrm(payload)]);

  for (const result of results) {
    if (result.status === 'rejected') {
      payload.logger.error({ err: result.reason, msg: 'сбой прохода задачи tick' });
    }
  }
};
