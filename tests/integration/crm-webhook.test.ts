import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTick } from '@/jobs/tick';
import {
  MASTER_NAME,
  SERVICE_NAME,
  createBookingVia,
  createCatalog,
  findBookings,
  initPayload,
  mockFetch,
  postBooking,
  postCancel,
  resetData,
  slotIso,
  stubEnv,
  type Catalog,
  type FetchCall,
  type TestPayload,
} from './fixtures';

const ANNA = { platform: 'telegram', userId: 4242 } as const;
const OLEG_MAX = { platform: 'max', userId: 9001 } as const;
const HOUR = 3_600_000;

let ctx: TestPayload;
let catalog: Catalog;
let fetchMock: ReturnType<typeof mockFetch>;

/** Позже реальных now и возможных пауз между повторами. */
const laterTick = (n: number): Date => new Date(Date.now() + n * HOUR);

const crmPayload = (call: FetchCall) => {
  const body = call.body as {
    event: string;
    bookingId: unknown;
    service: { id: unknown; name: string };
    master: { id: unknown; name: string };
    startAt: string;
    endAt: string;
    platform: string;
  };

  return {
    ...body,
    bookingId: String(body.bookingId),
    service: { id: String(body.service.id), name: body.service.name },
    master: { id: String(body.master.id), name: body.master.name },
  };
};

const expectedPayload = (event: string, bookingId: number | string, platform: string) => ({
  event,
  bookingId: String(bookingId),
  service: { id: String(catalog.service.id), name: SERVICE_NAME },
  master: { id: String(catalog.master.id), name: MASTER_NAME },
  startAt: slotIso('10:00'),
  endAt: slotIso('11:00'),
  platform,
});

const bookingState = async (id: number | string) => {
  const booking = await ctx.local.findByID({ collection: 'bookings', id, depth: 0, overrideAccess: true });

  return { crmStatus: booking.crmStatus, crmAttempts: booking.crmAttempts };
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
  fetchMock = mockFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('вебхук CRM', () => {
  it('5.1 запись создана: POST на CRM_WEBHOOK_URL с booking.created, услугой, мастером, временем, платформой; crmStatus sent', async () => {
    const id = await createBookingVia(catalog, slotIso('10:00'), OLEG_MAX);

    await vi.waitFor(() => expect(fetchMock.crmCalls()).toHaveLength(1));

    const [call] = fetchMock.crmCalls();

    expect(call!.method).toBe('POST');
    expect(crmPayload(call!)).toEqual(expectedPayload('booking.created', id, 'max'));
    await vi.waitFor(async () => expect((await bookingState(id)).crmStatus).toBe('sent'));
  });

  it('5.2 запись отменена: вебхук booking.cancelled с теми же полями', async () => {
    const id = await createBookingVia(catalog, slotIso('10:00'), ANNA);

    expect((await postCancel(id, ANNA)).status).toBe(200);

    await vi.waitFor(() => expect(fetchMock.crmCalls()).toHaveLength(2));

    const cancelled = fetchMock
      .crmCalls()
      .filter((call) => (call.body as { event: string }).event === 'booking.cancelled');

    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]!.method).toBe('POST');
    expect(crmPayload(cancelled[0]!)).toEqual(expectedPayload('booking.cancelled', id, 'telegram'));
  });

  it('5.3 CRM отвечает 500: 201, запись в базе, crmStatus failed, crmAttempts 1', async () => {
    fetchMock.setCrm(() => new Response('boom', { status: 500 }));

    const response = await postBooking(catalog, slotIso('10:00'), ANNA);

    expect(response.status).toBe(201);

    const bookings = await findBookings(ctx);

    expect(bookings).toHaveLength(1);
    await vi.waitFor(async () =>
      expect(await bookingState(bookings[0]!.id)).toEqual({ crmStatus: 'failed', crmAttempts: 1 }),
    );
  });

  it('5.4 fetch к CRM бросает (сеть): 201, запись в базе, crmStatus failed', async () => {
    fetchMock.setCrm(() => {
      throw new TypeError('fetch failed');
    });

    const response = await postBooking(catalog, slotIso('10:00'), ANNA);

    expect(response.status).toBe(201);

    const bookings = await findBookings(ctx);

    expect(bookings).toHaveLength(1);
    await vi.waitFor(async () => expect((await bookingState(bookings[0]!.id)).crmStatus).toBe('failed'));
  });

  it('5.5 failed и runTick при живом CRM: повтор вебхука, crmStatus sent', async () => {
    fetchMock.setCrm(() => new Response('boom', { status: 500 }));

    const id = await createBookingVia(catalog, slotIso('10:00'), ANNA);

    await vi.waitFor(async () => expect((await bookingState(id)).crmStatus).toBe('failed'));

    fetchMock.setCrm(() => new Response('{}', { status: 200 }));
    fetchMock.clear();

    await runTick(ctx.payload, laterTick(1));

    expect(fetchMock.crmCalls()).toHaveLength(1);
    expect(crmPayload(fetchMock.crmCalls()[0]!)).toEqual(expectedPayload('booking.created', id, 'telegram'));
    expect((await bookingState(id)).crmStatus).toBe('sent');
  });

  it('5.5 после 5 неудач шестой попытки нет', async () => {
    fetchMock.setCrm(() => new Response('boom', { status: 500 }));

    const id = await createBookingVia(catalog, slotIso('10:00'), ANNA);

    await vi.waitFor(async () => expect((await bookingState(id)).crmAttempts).toBe(1));

    for (let hour = 1; hour <= 4; hour += 1) {
      await runTick(ctx.payload, laterTick(hour));
    }

    expect(await bookingState(id)).toEqual({ crmStatus: 'failed', crmAttempts: 5 });
    expect(fetchMock.crmCalls()).toHaveLength(5);

    await runTick(ctx.payload, laterTick(5));
    await runTick(ctx.payload, laterTick(6));

    expect(fetchMock.crmCalls()).toHaveLength(5);
    expect(await bookingState(id)).toEqual({ crmStatus: 'failed', crmAttempts: 5 });
  });

  it('5.6 CRM_WEBHOOK_URL пуст: вызова CRM нет, 201, crmStatus skipped', async () => {
    stubEnv('');

    const response = await postBooking(catalog, slotIso('10:00'), ANNA);

    expect(response.status).toBe(201);

    const bookings = await findBookings(ctx);

    expect(bookings).toHaveLength(1);
    expect(bookings[0]!.crmStatus).toBe('skipped');
    expect(fetchMock.calls.filter((call) => call.url.includes('crm.test'))).toEqual([]);
  });
});
