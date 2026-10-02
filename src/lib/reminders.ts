import { HOUR_MS } from './consts';
import type { ReminderKind, ReminderStore } from './types';

const OFFSETS: { kind: ReminderKind; hours: number }[] = [
  { kind: '24h', hours: 24 },
  { kind: '2h', hours: 2 },
];

export const planReminders = (startAt: Date, now: Date): { kind: ReminderKind; sendAt: Date }[] =>
  OFFSETS.map(({ kind, hours }) => ({ kind, sendAt: new Date(startAt.getTime() - hours * HOUR_MS) })).filter(
    ({ sendAt }) => sendAt.getTime() > now.getTime(),
  );

export const scheduleReminders = async (
  booking: { id: string | number; startAt: Date },
  store: ReminderStore,
  now: Date,
): Promise<void> => {
  for (const { kind, sendAt } of planReminders(booking.startAt, now)) {
    await store.insert({ bookingId: booking.id, kind, sendAt, status: 'pending' });
  }
};

export const cancelReminders = async (bookingId: string | number, store: ReminderStore): Promise<void> => {
  for (const reminder of await store.findByBooking(bookingId)) {
    if (reminder.status === 'pending') {
      await store.setStatus(reminder.id, 'cancelled');
    }
  }
};
