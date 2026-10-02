import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTick } from '@/jobs/tick';
import { HOUR, bodyChatId, bodyText, botOutage, createAdminApi, reminderRows } from './admin-fixtures';
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
  type TestPayload,
} from './fixtures';

const ANNA = { platform: 'telegram', userId: 4242 } as const;
const START = new Date(slotIso('10:00')).getTime();

let ctx: TestPayload;
let catalog: Catalog;
let fetchMock: ReturnType<typeof mockFetch>;
let bot: ReturnType<typeof botOutage>;

/** Запись через API; побочные вызовы дожидаются и стираются. */
const bookAnna = async () => {
  const id = await createBookingVia(catalog, slotIso('10:00'), ANNA);

  await waitForQuiet(fetchMock.calls);
  fetchMock.clear();

  return id;
};

/** Момент тика: через минуту после того, как созрело напоминание за `hoursBefore` часов. */
const tickAt = (hoursBefore: number): Date => new Date(START - hoursBefore * HOUR + 60_000);

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
  await createAdminApi(ctx);
  fetchMock = mockFetch();
  bot = botOutage(fetchMock.spy);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('доставка напоминаний', () => {
  it('8.1 текст напоминания: дата и время записи в поясе бизнеса, без «через»', async () => {
    await bookAnna();

    await runTick(ctx.payload, tickAt(24));
    await runTick(ctx.payload, tickAt(2));

    const calls = fetchMock.telegramCalls();

    expect(calls).toHaveLength(2);

    for (const call of calls) {
      // 10:00 по Калининграду = 08:00Z: в тексте местное время, не UTC.
      expect(bodyText(call)).toContain('12.03.2030');
      expect(bodyText(call)).toContain('10:00');
      expect(bodyText(call)).not.toContain('08:00');
      expect(bodyText(call)).not.toMatch(/через/i);
    }
  });

  it('8.2 созрели оба напоминания записи: клиенту одно сообщение; 2h sent, 24h cancelled', async () => {
    const id = await bookAnna();

    await runTick(ctx.payload, new Date(START - 90 * 60_000));

    expect(fetchMock.calls).toHaveLength(1);
    expect(fetchMock.telegramCalls()).toHaveLength(1);
    expect(bodyChatId(fetchMock.telegramCalls()[0]!)).toBe(String(ANNA.userId));
    expect((await reminderRows(ctx, id)).map((row) => [row.kind, row.status])).toEqual([
      ['24h', 'cancelled'],
      ['2h', 'sent'],
    ]);
  });

  it('8.3 бот ответил ошибкой: pending и attempts 1; следующий тик при живом боте: sent', async () => {
    const id = await bookAnna();

    bot.down = true;
    await runTick(ctx.payload, tickAt(24));

    expect(fetchMock.telegramCalls()).toHaveLength(1);
    expect((await reminderRows(ctx, id)).map((row) => [row.kind, row.status, row.attempts])).toEqual([
      ['24h', 'pending', 1],
      ['2h', 'pending', 0],
    ]);

    bot.down = false;
    await runTick(ctx.payload, tickAt(24));

    expect(fetchMock.telegramCalls()).toHaveLength(2);
    expect((await reminderRows(ctx, id)).map((row) => [row.kind, row.status])).toEqual([
      ['24h', 'sent'],
      ['2h', 'pending'],
    ]);
  });

  it('8.4 пять неудач подряд: failed; на шестом тике запроса к боту по нему нет', async () => {
    const id = await bookAnna();

    bot.down = true;

    for (let tick = 1; tick <= 5; tick += 1) {
      await runTick(ctx.payload, tickAt(24));
    }

    expect(fetchMock.telegramCalls()).toHaveLength(5);
    expect((await reminderRows(ctx, id)).map((row) => [row.kind, row.status, row.attempts])).toEqual([
      ['24h', 'failed', 5],
      ['2h', 'pending', 0],
    ]);

    bot.down = false;
    await runTick(ctx.payload, tickAt(24));

    expect(fetchMock.telegramCalls()).toHaveLength(5);
    expect((await reminderRows(ctx, id)).map((row) => row.status)).toEqual(['failed', 'pending']);
  });
});
