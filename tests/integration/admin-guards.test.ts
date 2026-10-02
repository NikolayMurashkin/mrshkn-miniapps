import { APIError } from 'payload';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOUR, createAdminApi, createClient, findBooking, iso, reminderRows, type AdminApi } from './admin-fixtures';
import {
  createBookingVia,
  createCatalog,
  initPayload,
  mockFetch,
  resetData,
  slotIso,
  stubEnv,
  waitForQuiet,
  type Catalog,
  type Doc,
  type TestPayload,
} from './fixtures';

const ANNA = { platform: 'telegram', userId: 4242 } as const;
const BORIS = { platform: 'telegram', userId: 4343 } as const;

let ctx: TestPayload;
let admin: AdminApi;
let adminUser: Record<string, unknown>;
let catalog: Catalog;
let fetchMock: ReturnType<typeof mockFetch>;

type BulkUpdate = {
  update(args: {
    collection: string;
    where: Record<string, unknown>;
    data: Record<string, unknown>;
    user?: Record<string, unknown>;
    overrideAccess?: boolean;
  }): Promise<unknown>;
};

/** Массовый update bookings: админ (user + overrideAccess: false) или системный вызов (без user). */
const bulkUpdate = (
  mode: 'admin' | 'system',
  ids: (number | string)[],
  data: Record<string, unknown>,
): Promise<unknown> => {
  const api = ctx.payload as unknown as BulkUpdate;
  const where = { id: { in: ids } };

  return mode === 'admin'
    ? api.update({ collection: 'bookings', where, data, user: adminUser, overrideAccess: false })
    : api.update({ collection: 'bookings', where, data });
};

const settle = async (): Promise<void> => {
  await waitForQuiet(fetchMock.calls);
};

/** Запись через Mini App; побочные вызовы дожидаются и стираются, дальше считаются только вызовы теста. */
const bookViaApi = async (who: typeof ANNA | typeof BORIS, at: string) => {
  const id = await createBookingVia(catalog, slotIso(at), who);

  await settle();
  fetchMock.clear();

  return id;
};

/** Отказ 403: встроенный `disableBulkEdit` Payload (APIError) или Forbidden (его подкласс). */
const expectForbidden = async (promise: Promise<unknown>): Promise<void> => {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );

  expect(error).toBeInstanceOf(APIError);
  expect((error as APIError).status).toBe(403);
};

const startIso = (booking: Doc): string => new Date(String(booking.startAt)).toISOString();

beforeAll(async () => {
  ctx = await initPayload();
});

afterAll(async () => {
  await ctx.payload.destroy();
});

beforeEach(async () => {
  stubEnv();
  await resetData(ctx);
  catalog = await createCatalog(ctx.local);
  admin = await createAdminApi(ctx);

  const { docs } = await ctx.local.find({ collection: 'users', overrideAccess: true });

  adminUser = { ...docs[0]!, collection: 'users' };
  fetchMock = mockFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('массовая правка записей', () => {
  describe('9.1 перенос двух записей одним update', () => {
    it.each([
      { name: 'админ (user, overrideAccess: false)', mode: 'admin' as const },
      { name: 'системный вызов без user', mode: 'system' as const },
    ])('$name: 403, обе записи прежние, напоминания прежние, fetch не вызван', async ({ mode }) => {
      const first = await bookViaApi(ANNA, '10:00');
      const second = await bookViaApi(BORIS, '12:00');
      const remindersBefore = [await reminderRows(ctx, first), await reminderRows(ctx, second)];

      await expectForbidden(bulkUpdate(mode, [first, second], { startAt: slotIso('15:00') }));
      await settle();

      const firstAfter = await findBooking(ctx, first);
      const secondAfter = await findBooking(ctx, second);

      expect(startIso(firstAfter)).toBe(slotIso('10:00'));
      expect(startIso(secondAfter)).toBe(slotIso('12:00'));
      expect(firstAfter.status).toBe('active');
      expect(secondAfter.status).toBe('active');
      expect([await reminderRows(ctx, first), await reminderRows(ctx, second)]).toEqual(remindersBefore);
      expect(fetchMock.calls).toEqual([]);
    });
  });

  it('9.2 админ массово ставит статус «Отменена» двум записям: 403, обе active', async () => {
    const first = await bookViaApi(ANNA, '10:00');
    const second = await bookViaApi(BORIS, '12:00');

    await expectForbidden(bulkUpdate('admin', [first, second], { status: 'cancelled' }));
    await settle();

    expect((await findBooking(ctx, first)).status).toBe('active');
    expect((await findBooking(ctx, second)).status).toBe('active');
  });

  it('9.3 конфиг коллекции bookings: disableBulkEdit === true', () => {
    expect(ctx.payload.collections['bookings']!.config.disableBulkEdit).toBe(true);
  });
});

describe('служебные поля при правке одной записи', () => {
  describe('10.1 чужое значение служебного поля без переноса', () => {
    it.each([
      { field: 'endAt', foreign: iso(new Date(slotIso('10:00')).getTime() + 3 * HOUR) },
      { field: 'platform', foreign: 'max' },
      { field: 'crmStatus', foreign: 'skipped' },
      { field: 'crmEvent', foreign: 'booking.cancelled' },
      { field: 'crmAttempts', foreign: 7 },
    ])('$field: правка проходит, в базе прежнее, fetch не вызван', async ({ field, foreign }) => {
      const id = await bookViaApi(ANNA, '10:00');
      const before = await findBooking(ctx, id);

      expect(before[field]).not.toEqual(foreign);

      await admin.updateBooking(id, { [field]: foreign });
      await settle();

      const after = await findBooking(ctx, id);

      if (field === 'endAt') {
        expect(new Date(String(after.endAt)).toISOString()).toBe(new Date(String(before.endAt)).toISOString());
      } else {
        expect(after[field]).toEqual(before[field]);
      }

      expect(fetchMock.calls).toEqual([]);
    });
  });

  it('10.2 перенос с подложенными endAt, platform, crmAttempts: endAt вычислен, platform прежняя, crmEvent booking.updated, crmAttempts 0', async () => {
    const id = await bookViaApi(ANNA, '10:00');

    await admin.updateBooking(id, {
      startAt: slotIso('15:00'),
      endAt: iso(new Date(slotIso('15:00')).getTime() + 5 * HOUR),
      platform: 'max',
      crmAttempts: 7,
    });
    await settle();

    const booking = await findBooking(ctx, id);

    expect(startIso(booking)).toBe(slotIso('15:00'));
    expect(new Date(String(booking.endAt)).toISOString()).toBe(slotIso('16:00'));
    expect(booking.platform).toBe('telegram');
    expect(booking.crmEvent).toBe('booking.updated');
    expect(booking.crmAttempts).toBe(0);
  });

  it('10.3 отмена с подложенными platform, endAt: оба прежние, crmEvent booking.cancelled', async () => {
    const id = await bookViaApi(ANNA, '10:00');

    await admin.updateBooking(id, {
      status: 'cancelled',
      platform: 'max',
      endAt: iso(new Date(slotIso('10:00')).getTime() + 5 * HOUR),
    });
    await settle();

    const booking = await findBooking(ctx, id);

    expect(booking.status).toBe('cancelled');
    expect(booking.platform).toBe('telegram');
    expect(new Date(String(booking.endAt)).toISOString()).toBe(slotIso('11:00'));
    expect(booking.crmEvent).toBe('booking.cancelled');
  });

  it('10.4 создание с platform max у клиента Telegram и произвольным endAt: platform telegram, endAt вычислен', async () => {
    const client = await createClient(ctx, ANNA);

    const created = await admin.createBooking({
      service: catalog.service.id,
      master: catalog.master.id,
      client: client.id,
      startAt: slotIso('10:00'),
      platform: 'max',
      endAt: iso(new Date(slotIso('10:00')).getTime() + 5 * HOUR),
    });
    await settle();

    const booking = await findBooking(ctx, created.id);

    expect(booking.platform).toBe('telegram');
    expect(new Date(String(booking.endAt)).toISOString()).toBe(slotIso('11:00'));
  });
});
