import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MASTER_NAME,
  MAX_BASE,
  MAX_TOKEN,
  OWNER_CHAT_ID,
  SERVICE_NAME,
  createAdmin,
  createBookingVia,
  createCatalog,
  findBookings,
  getSlots,
  initPayload,
  mockFetch,
  postBooking,
  postCancel,
  relId,
  resetData,
  slotIso,
  stubEnv,
  type Catalog,
  type TestPayload,
} from './fixtures';

const ANNA = { platform: 'telegram', userId: 4242 } as const;
const BORIS = { platform: 'telegram', userId: 4343 } as const;
const OLEG_MAX = { platform: 'max', userId: 9001 } as const;

let ctx: TestPayload;
let catalog: Catalog;
let fetchMock: ReturnType<typeof mockFetch>;

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

describe('запись -> бот -> админка', () => {
  it('3.1 POST /bookings с initData Telegram на свободный слот: 201, владельцу и клиенту ушло сообщение в Telegram', async () => {
    const response = await postBooking(catalog, slotIso('10:00'), ANNA);

    expect(response.status).toBe(201);

    await vi.waitFor(() => {
      const toOwner = fetchMock
        .telegramCalls()
        .filter((call) => String((call.body as { chat_id: unknown }).chat_id) === OWNER_CHAT_ID);
      const toClient = fetchMock
        .telegramCalls()
        .filter((call) => String((call.body as { chat_id: unknown }).chat_id) === String(ANNA.userId));

      expect(toOwner).toHaveLength(1);
      expect(toClient).toHaveLength(1);

      const ownerText = (toOwner[0]!.body as { text: string }).text;

      expect(toOwner[0]!.method).toBe('POST');
      expect(ownerText).toContain(SERVICE_NAME);
      expect(ownerText).toContain(MASTER_NAME);
      expect(ownerText).toContain('10:00');
    });
  });

  it('3.2 то же из MAX: владельцу - Telegram, клиенту - MAX /messages?user_id с заголовком Authorization', async () => {
    const response = await postBooking(catalog, slotIso('10:00'), OLEG_MAX);

    expect(response.status).toBe(201);

    await vi.waitFor(() => {
      expect(fetchMock.telegramCalls().map((call) => String((call.body as { chat_id: unknown }).chat_id))).toEqual([
        OWNER_CHAT_ID,
      ]);
      expect(fetchMock.maxCalls()).toHaveLength(1);
    });

    const maxCall = fetchMock.maxCalls()[0]!;

    expect(maxCall.url).toBe(`${MAX_BASE}/messages?user_id=${OLEG_MAX.userId}`);
    expect(maxCall.method).toBe('POST');
    expect(maxCall.headers.get('authorization')).toBe(MAX_TOKEN);
    expect(typeof (maxCall.body as { text: unknown }).text).toBe('string');
  });

  it('3.3 админ читает записи через Local API (overrideAccess: false): запись видна, platform и клиент на месте', async () => {
    const admin = await createAdmin(ctx.local);
    const id = await createBookingVia(catalog, slotIso('10:00'), OLEG_MAX);

    const { docs } = await ctx.local.find({
      collection: 'bookings',
      depth: 1,
      user: { ...admin, collection: 'users' },
      overrideAccess: false,
    });

    expect(docs).toHaveLength(1);
    expect(String(docs[0]!.id)).toBe(String(id));
    expect(docs[0]!.platform).toBe('max');
    expect(relId(docs[0]!.service)).toBe(String(catalog.service.id));
    expect(relId(docs[0]!.master)).toBe(String(catalog.master.id));

    const client = docs[0]!.client as { platform: unknown; platformUserId: unknown };

    expect(typeof client).toBe('object');
    expect(client.platform).toBe('max');
    expect(String(client.platformUserId)).toBe(String(OLEG_MAX.userId));
  });

  it('3.4 второй клиент пишет на тот же слот того же мастера: 409, запись одна', async () => {
    expect((await postBooking(catalog, slotIso('10:00'), ANNA)).status).toBe(201);
    expect((await postBooking(catalog, slotIso('10:00'), BORIS)).status).toBe(409);
    expect(await findBookings(ctx)).toHaveLength(1);
  });

  it('3.5 два одновременных запроса на один слот: ровно один 201, другой 409, запись одна', async () => {
    const responses = await Promise.all([
      postBooking(catalog, slotIso('10:00'), ANNA),
      postBooking(catalog, slotIso('10:00'), BORIS),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await findBookings(ctx)).toHaveLength(1);
  });

  it('3.6 startAt не из сетки слотов (вне расписания, в перерыв, между шагами): 409, записей нет', async () => {
    for (const startAt of [slotIso('07:00'), slotIso('13:00'), slotIso('17:30'), slotIso('10:15')]) {
      expect((await postBooking(catalog, startAt, ANNA)).status, startAt).toBe(409);
    }

    expect(await findBookings(ctx)).toHaveLength(0);
  });

  it('3.7 после отмены записи слот снова в GET /slots', async () => {
    const slot = new Date(slotIso('10:00')).getTime();
    const id = await createBookingVia(catalog, slotIso('10:00'), ANNA);

    expect(await getSlots(catalog, ANNA)).not.toContain(slot);

    const cancel = await postCancel(id, ANNA);

    expect(cancel.status).toBe(200);
    expect(await getSlots(catalog, ANNA)).toContain(slot);
  });

  it('3.8 клиент Б отменяет запись клиента А: 404, запись active', async () => {
    const id = await createBookingVia(catalog, slotIso('10:00'), ANNA);
    const cancel = await postCancel(id, BORIS);

    expect(cancel.status).toBe(404);
    expect((await ctx.local.findByID({ collection: 'bookings', id, depth: 0, overrideAccess: true })).status).toBe(
      'active',
    );
  });

  it('3.9 отмена начавшейся записи: 409, запись active', async () => {
    const id = await createBookingVia(catalog, slotIso('10:00'), ANNA);
    const started = new Date(Date.now() - 30 * 60_000);

    await ctx.local.update({
      collection: 'bookings',
      id,
      data: { startAt: started.toISOString(), endAt: new Date(started.getTime() + 60 * 60_000).toISOString() },
      overrideAccess: true,
    });

    expect((await postCancel(id, ANNA)).status).toBe(409);
    expect((await ctx.local.findByID({ collection: 'bookings', id, depth: 0, overrideAccess: true })).status).toBe(
      'active',
    );
  });
});
