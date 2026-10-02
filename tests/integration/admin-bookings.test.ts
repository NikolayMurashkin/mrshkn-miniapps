import { ValidationError } from 'payload';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTick } from '@/jobs/tick';
import {
  HOUR,
  bodyChatId,
  bodyText,
  createAdminApi,
  createClient,
  crmBody,
  findBooking,
  iso,
  reminderRows,
  type AdminApi,
} from './admin-fixtures';
import {
  CRM_URL,
  MAX_BASE,
  MAX_TOKEN,
  OWNER_CHAT_ID,
  SERVICE_NAME,
  createBookingVia,
  createCatalog,
  createMaster,
  findBookings,
  initPayload,
  mockFetch,
  postCancel,
  resetData,
  slotIso,
  stubEnv,
  waitForQuiet,
  type Catalog,
  type TestPayload,
} from './fixtures';

const ANNA = { platform: 'telegram', userId: 4242 } as const;
const BORIS = { platform: 'telegram', userId: 4343 } as const;
const OLEG_MAX = { platform: 'max', userId: 9001 } as const;

let ctx: TestPayload;
let admin: AdminApi;
let catalog: Catalog;
let fetchMock: ReturnType<typeof mockFetch>;

const settle = async (): Promise<void> => {
  await waitForQuiet(fetchMock.calls);
};

/** Запись клиента через Mini App; побочные вызовы дожидаются и стираются, дальше считаются только вызовы теста. */
const bookViaApi = async (who: typeof ANNA | typeof BORIS, at = '10:00') => {
  const id = await createBookingVia(catalog, slotIso(at), who);

  await settle();
  fetchMock.clear();

  return id;
};

const expectValidationFailure = async (promise: Promise<unknown>): Promise<void> => {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );

  expect(error).toBeInstanceOf(ValidationError);
};

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
  fetchMock = mockFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('правки записи в админке', () => {
  it('7.1 админ создает запись на свободный слот: active, endAt, platform клиента, два pending, сообщение клиенту, вебхук created, владельцу ничего', async () => {
    const client = await createClient(ctx, OLEG_MAX);

    const created = await admin.createBooking({
      service: catalog.service.id,
      master: catalog.master.id,
      client: client.id,
      startAt: slotIso('10:00'),
    });

    await settle();

    const booking = await findBooking(ctx, created.id);

    expect(booking.status).toBe('active');
    expect(new Date(String(booking.startAt)).toISOString()).toBe(slotIso('10:00'));
    expect(new Date(String(booking.endAt)).toISOString()).toBe(slotIso('11:00'));
    expect(booking.platform).toBe('max');

    const start = new Date(slotIso('10:00')).getTime();

    expect(await reminderRows(ctx, created.id)).toEqual([
      { kind: '24h', status: 'pending', sendAt: iso(start - 24 * HOUR), attempts: 0 },
      { kind: '2h', status: 'pending', sendAt: iso(start - 2 * HOUR), attempts: 0 },
    ]);

    expect(fetchMock.maxCalls()).toHaveLength(1);
    expect(fetchMock.maxCalls()[0]!.url).toBe(`${MAX_BASE}/messages?user_id=${OLEG_MAX.userId}`);
    expect(fetchMock.maxCalls()[0]!.headers.get('authorization')).toBe(MAX_TOKEN);
    expect(bodyText(fetchMock.maxCalls()[0]!)).toContain(SERVICE_NAME);
    expect(bodyText(fetchMock.maxCalls()[0]!)).toContain('10:00');

    expect(fetchMock.crmCalls()).toHaveLength(1);
    expect(crmBody(fetchMock.crmCalls()[0]!).event).toBe('booking.created');
    expect(fetchMock.telegramCalls().filter((call) => bodyChatId(call) === OWNER_CHAT_ID)).toEqual([]);
    expect(fetchMock.calls).toHaveLength(2);
  });

  describe('7.2 создание на недоступное время', () => {
    it.each([
      { name: 'занятый слот', at: '12:00', busy: true },
      { name: 'вне расписания', at: '09:00', busy: false },
      { name: 'в перерыв', at: '13:00', busy: false },
    ])('отказ: $name; записей не добавилось, fetch не вызван', async ({ at, busy }) => {
      if (busy) {
        await bookViaApi(BORIS, at);
      }

      const before = (await findBookings(ctx)).length;
      const client = await createClient(ctx, ANNA);
      const start = new Date(slotIso(at)).getTime();

      await expectValidationFailure(
        admin.createBooking({
          service: catalog.service.id,
          master: catalog.master.id,
          client: client.id,
          startAt: slotIso(at),
          // Служебные поля заполнены, чтобы отказ давала проверка слота, а не отсутствие обязательных полей.
          endAt: iso(start + HOUR),
          platform: 'telegram',
        }),
      );

      await settle();

      expect(await findBookings(ctx)).toHaveLength(before);
      expect(fetchMock.calls).toEqual([]);
    });
  });

  it('7.3 перенос на свободный слот: endAt пересчитан, старые pending cancelled, новые pending, клиенту сообщение, вебхук booking.updated', async () => {
    const id = await bookViaApi(ANNA);
    const oldStart = new Date(slotIso('10:00')).getTime();
    const newStart = new Date(slotIso('15:00')).getTime();

    await admin.updateBooking(id, { startAt: slotIso('15:00') });
    await settle();

    const booking = await findBooking(ctx, id);

    expect(new Date(String(booking.startAt)).toISOString()).toBe(slotIso('15:00'));
    expect(new Date(String(booking.endAt)).toISOString()).toBe(slotIso('16:00'));
    expect(booking.crmEvent).toBe('booking.updated');
    expect(booking.crmStatus).toBe('sent');

    const rows = await reminderRows(ctx, id);

    expect(rows.map((row) => [row.kind, row.status, row.sendAt])).toEqual([
      ['24h', 'cancelled', iso(oldStart - 24 * HOUR)],
      ['24h', 'pending', iso(newStart - 24 * HOUR)],
      ['2h', 'cancelled', iso(oldStart - 2 * HOUR)],
      ['2h', 'pending', iso(newStart - 2 * HOUR)],
    ]);

    expect(fetchMock.telegramCalls()).toHaveLength(1);
    expect(bodyChatId(fetchMock.telegramCalls()[0]!)).toBe(String(ANNA.userId));
    expect(bodyText(fetchMock.telegramCalls()[0]!)).toContain('15:00');

    expect(fetchMock.crmCalls()).toHaveLength(1);
    expect(fetchMock.crmCalls()[0]!.url).toBe(CRM_URL);
    expect(crmBody(fetchMock.crmCalls()[0]!)).toMatchObject({
      event: 'booking.updated',
      startAt: slotIso('15:00'),
      endAt: slotIso('16:00'),
    });
    expect(fetchMock.calls).toHaveLength(2);
  });

  it('7.4 перенос на слот, пересекающийся только с самой записью (сдвиг на шаг сетки): проходит', async () => {
    const id = await bookViaApi(ANNA);

    await admin.updateBooking(id, { startAt: slotIso('10:30') });
    await settle();

    const booking = await findBooking(ctx, id);

    expect(new Date(String(booking.startAt)).toISOString()).toBe(slotIso('10:30'));
    expect(new Date(String(booking.endAt)).toISOString()).toBe(slotIso('11:30'));
  });

  it('7.5 перенос на занятый другим клиентом слот: отказ, запись и напоминания прежние, fetch не вызван', async () => {
    const id = await bookViaApi(ANNA, '10:00');

    await bookViaApi(BORIS, '12:00');

    const bookingBefore = await findBooking(ctx, id);
    const remindersBefore = await reminderRows(ctx, id);

    await expectValidationFailure(admin.updateBooking(id, { startAt: slotIso('12:00') }));
    await settle();

    const bookingAfter = await findBooking(ctx, id);

    expect(new Date(String(bookingAfter.startAt)).toISOString()).toBe(slotIso('10:00'));
    expect(new Date(String(bookingAfter.endAt)).toISOString()).toBe(slotIso('11:00'));
    expect(bookingAfter.updatedAt).toBe(bookingBefore.updatedAt);
    expect(await reminderRows(ctx, id)).toEqual(remindersBefore);
    expect(fetchMock.calls).toEqual([]);
  });

  it('7.6 смена мастера на того, кто не оказывает услугу записи: отказ', async () => {
    const id = await bookViaApi(ANNA);
    const otherService = await ctx.local.create({
      collection: 'services',
      data: { name: 'Маникюр', durationMin: 60 },
      overrideAccess: true,
    });
    const otherMaster = await createMaster(ctx.local, { name: 'Ольга Седова', serviceIds: [otherService.id] });

    await expectValidationFailure(admin.updateBooking(id, { master: otherMaster.id }));
    await settle();

    const booking = await findBooking(ctx, id);

    expect(String(booking.master)).toBe(String(catalog.master.id));
    expect(fetchMock.calls).toEqual([]);
  });

  it('7.7 статус «Отменена»: pending стали cancelled, клиенту сообщение об отмене, вебхук booking.cancelled', async () => {
    const id = await bookViaApi(ANNA);

    await admin.updateBooking(id, { status: 'cancelled' });
    await settle();

    expect((await findBooking(ctx, id)).status).toBe('cancelled');
    expect((await reminderRows(ctx, id)).map((row) => [row.kind, row.status])).toEqual([
      ['24h', 'cancelled'],
      ['2h', 'cancelled'],
    ]);

    expect(fetchMock.telegramCalls()).toHaveLength(1);
    expect(bodyChatId(fetchMock.telegramCalls()[0]!)).toBe(String(ANNA.userId));
    expect(bodyText(fetchMock.telegramCalls()[0]!)).toMatch(/отмен/i);

    expect(fetchMock.crmCalls()).toHaveLength(1);
    expect(crmBody(fetchMock.crmCalls()[0]!).event).toBe('booking.cancelled');
    expect(fetchMock.calls).toHaveLength(2);
  });

  describe('7.8 правка отмененной записи', () => {
    it.each([
      { name: 'статус обратно в active', data: { status: 'active' } },
      { name: 'перенос времени', data: { startAt: slotIso('15:00') } },
    ])('отказ: $name; запись прежняя', async ({ data }) => {
      const id = await createBookingVia(catalog, slotIso('10:00'), ANNA);

      expect((await postCancel(id, ANNA)).status).toBe(200);
      await settle();
      fetchMock.clear();

      const before = await findBooking(ctx, id);
      const remindersBefore = await reminderRows(ctx, id);

      await expectValidationFailure(admin.updateBooking(id, data));
      await settle();

      const after = await findBooking(ctx, id);

      expect(after.status).toBe('cancelled');
      expect(new Date(String(after.startAt)).toISOString()).toBe(slotIso('10:00'));
      expect(after.updatedAt).toBe(before.updatedAt);
      expect(await reminderRows(ctx, id)).toEqual(remindersBefore);
      expect(fetchMock.calls).toEqual([]);
    });
  });

  it('7.9 запись создана и отменена через API Mini App: хуки не задвоили (два напоминания, по вебхуку на создание и отмену, клиенту одно подтверждение)', async () => {
    const id = await createBookingVia(catalog, slotIso('10:00'), ANNA);

    expect((await postCancel(id, ANNA)).status).toBe(200);
    await settle();

    expect(await reminderRows(ctx, id)).toHaveLength(2);
    expect(
      fetchMock
        .crmCalls()
        .map((call) => crmBody(call).event)
        .sort(),
    ).toEqual(['booking.cancelled', 'booking.created']);
    expect(fetchMock.telegramCalls().filter((call) => bodyChatId(call) === String(ANNA.userId))).toHaveLength(1);
  });

  it('7.10 вебхук booking.updated упал, runTick при живом CRM: повтор шлет booking.updated, crmStatus sent', async () => {
    const id = await bookViaApi(ANNA);

    fetchMock.setCrm(() => new Response('boom', { status: 500 }));

    await admin.updateBooking(id, { startAt: slotIso('15:00') });
    await settle();

    const failed = await findBooking(ctx, id);

    expect(failed.crmStatus).toBe('failed');
    expect(failed.crmEvent).toBe('booking.updated');
    expect(failed.crmAttempts).toBe(1);

    fetchMock.setCrm(() => new Response('{}', { status: 200 }));
    fetchMock.clear();

    await runTick(ctx.payload, new Date(Date.now() + HOUR));

    expect(fetchMock.crmCalls()).toHaveLength(1);
    expect(crmBody(fetchMock.crmCalls()[0]!)).toMatchObject({ event: 'booking.updated', startAt: slotIso('15:00') });
    expect((await findBooking(ctx, id)).crmStatus).toBe('sent');
  });
});
