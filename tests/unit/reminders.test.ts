import { describe, expect, it } from 'vitest';
import { cancelReminders, planReminders, scheduleReminders } from '@/lib/reminders';
import type { Reminder, ReminderStore } from '@/lib/types';

const NOW = new Date('2030-03-10T09:00:00.000Z');
const HOUR = 3_600_000;
const startIn = (hours: number): Date => new Date(NOW.getTime() + hours * HOUR);
const byKind = <T extends { kind: string }>(items: T[]): T[] => [...items].sort((a, b) => a.kind.localeCompare(b.kind));

/** Фейковое хранилище в памяти. */
const createFakeStore = (): ReminderStore & { rows: Reminder[] } => {
  const rows: Reminder[] = [];

  return {
    rows,
    insert: async (r) => {
      rows.push({ id: rows.length + 1, ...r });
    },
    findByBooking: async (bookingId) => rows.filter((row) => row.bookingId === bookingId),
    setStatus: async (id, status) => {
      const row = rows.find((candidate) => candidate.id === id);

      if (row) {
        row.status = status;
      }
    },
  };
};

describe('planReminders', () => {
  it('4.1 запись через 3 дня: два напоминания, 24h и 2h', () => {
    const startAt = startIn(72);

    expect(byKind(planReminders(startAt, NOW))).toEqual([
      { kind: '24h', sendAt: new Date(startAt.getTime() - 24 * HOUR) },
      { kind: '2h', sendAt: new Date(startAt.getTime() - 2 * HOUR) },
    ]);
  });

  it('4.2 запись через 10 ч: только 2h', () => {
    const startAt = startIn(10);

    expect(planReminders(startAt, NOW)).toEqual([{ kind: '2h', sendAt: new Date(startAt.getTime() - 2 * HOUR) }]);
  });

  it('4.3 запись через 1 ч: нет напоминаний', () => {
    expect(planReminders(startIn(1), NOW)).toEqual([]);
  });

  it('4.4 запись ровно через 24 ч: только 2h (время напоминания строго в будущем)', () => {
    const startAt = startIn(24);

    expect(planReminders(startAt, NOW)).toEqual([{ kind: '2h', sendAt: new Date(startAt.getTime() - 2 * HOUR) }]);
  });
});

describe('scheduleReminders и cancelReminders', () => {
  it('4.5 scheduleReminders: два pending; cancelReminders: оба cancelled', async () => {
    const store = createFakeStore();
    const startAt = startIn(72);

    await scheduleReminders({ id: 'b-1', startAt }, store, NOW);

    const scheduled = byKind(await store.findByBooking('b-1'));

    expect(scheduled.map((r) => [r.kind, r.status, r.sendAt.toISOString()])).toEqual([
      ['24h', 'pending', new Date(startAt.getTime() - 24 * HOUR).toISOString()],
      ['2h', 'pending', new Date(startAt.getTime() - 2 * HOUR).toISOString()],
    ]);

    await cancelReminders('b-1', store);

    expect(byKind(await store.findByBooking('b-1')).map((r) => [r.kind, r.status])).toEqual([
      ['24h', 'cancelled'],
      ['2h', 'cancelled'],
    ]);
  });

  it('4.6 одно напоминание уже sent, затем отмена: sent не меняется, pending становится cancelled', async () => {
    const store = createFakeStore();

    await scheduleReminders({ id: 'b-2', startAt: startIn(72) }, store, NOW);

    const [first] = byKind(await store.findByBooking('b-2'));

    expect(first?.kind).toBe('24h');
    await store.setStatus(first!.id, 'sent');
    await cancelReminders('b-2', store);

    expect(byKind(await store.findByBooking('b-2')).map((r) => [r.kind, r.status])).toEqual([
      ['24h', 'sent'],
      ['2h', 'cancelled'],
    ]);
  });
});
