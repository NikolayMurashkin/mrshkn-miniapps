import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTick } from '@/jobs/tick';
import {
  MAX_BASE,
  MAX_TOKEN,
  createBookingVia,
  createCatalog,
  createMaster,
  initPayload,
  mockFetch,
  postCancel,
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
const OLEG_MAX = { platform: 'max', userId: 9001 } as const;
const HOUR = 3_600_000;

let ctx: TestPayload;
let catalog: Catalog;
let fetchMock: ReturnType<typeof mockFetch>;

const remindersOf = async (bookingId: number | string): Promise<Doc[]> => {
  const { docs } = await ctx.local.find({
    collection: 'reminders',
    where: { booking: { equals: bookingId } },
    depth: 0,
    limit: 10,
    overrideAccess: true,
  });

  return [...docs].sort((a, b) => String(a.kind).localeCompare(String(b.kind)));
};

beforeAll(async () => {
  ctx = await initPayload();
});

afterAll(async () => {
  await ctx.payload.destroy();
});

beforeEach(async () => {
  stubEnv('');
  await resetData(ctx);
  catalog = await createCatalog(ctx.local);
  fetchMock = mockFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('напоминания в базе', () => {
  it('4.7 запись через API: в reminders два pending (24h и 2h); после отмены оба cancelled', async () => {
    const startAt = new Date(slotIso('10:00'));
    const id = await createBookingVia(catalog, slotIso('10:00'), ANNA);

    expect((await remindersOf(id)).map((r) => [r.kind, r.status, new Date(String(r.sendAt)).toISOString()])).toEqual([
      ['24h', 'pending', new Date(startAt.getTime() - 24 * HOUR).toISOString()],
      ['2h', 'pending', new Date(startAt.getTime() - 2 * HOUR).toISOString()],
    ]);

    expect((await postCancel(id, ANNA)).status).toBe(200);

    expect((await remindersOf(id)).map((r) => [r.kind, r.status])).toEqual([
      ['24h', 'cancelled'],
      ['2h', 'cancelled'],
    ]);
  });

  it('4.8 runTick(now): созревшее напоминание ушло ботом платформы клиента и стало sent; несозревшее и cancelled не отправлены', async () => {
    const secondMaster = await createMaster(ctx.local, { name: 'Ольга Седова', serviceIds: [catalog.service.id] });
    const otherCatalog: Catalog = { service: catalog.service, master: secondMaster };

    // Б записывается на слот мастера 1 и отменяет: его напоминания cancelled, слот свободен для А.
    const cancelledId = await createBookingVia(catalog, slotIso('10:00'), BORIS);

    await postCancel(cancelledId, BORIS);

    const tgId = await createBookingVia(catalog, slotIso('10:00'), ANNA);
    const maxId = await createBookingVia(otherCatalog, slotIso('10:00'), OLEG_MAX);

    await waitForQuiet(fetchMock.calls);
    fetchMock.clear();

    const now = new Date(new Date(slotIso('10:00')).getTime() - 24 * HOUR + 60_000);

    await runTick(ctx.payload, now);

    const telegram = fetchMock.telegramCalls();
    const max = fetchMock.maxCalls();

    expect(fetchMock.calls).toHaveLength(2);
    expect(telegram).toHaveLength(1);
    expect(String((telegram[0]!.body as { chat_id: unknown }).chat_id)).toBe(String(ANNA.userId));
    expect(typeof (telegram[0]!.body as { text: unknown }).text).toBe('string');
    expect(max).toHaveLength(1);
    expect(max[0]!.url).toBe(`${MAX_BASE}/messages?user_id=${OLEG_MAX.userId}`);
    expect(max[0]!.headers.get('authorization')).toBe(MAX_TOKEN);

    for (const id of [tgId, maxId]) {
      expect((await remindersOf(id)).map((r) => [r.kind, r.status])).toEqual([
        ['24h', 'sent'],
        ['2h', 'pending'],
      ]);
    }

    expect((await remindersOf(cancelledId)).map((r) => [r.kind, r.status])).toEqual([
      ['24h', 'cancelled'],
      ['2h', 'cancelled'],
    ]);
  });
});
