import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTick } from '@/jobs/tick';
import {
  createBookingVia,
  createCatalog,
  initPayload,
  mockFetch,
  resetData,
  slotIso,
  stubEnv,
  waitForQuiet,
  type Doc,
  type TestPayload,
} from './fixtures';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Час проходов задачи зафиксирован: токены и отметка очистки сравниваются с ним, а не с часами машины. */
const NOW = new Date('2030-03-12T12:00:00.000Z');
const ANNA = { platform: 'telegram', userId: 4242 } as const;

let ctx: TestPayload;
let fetchMock: ReturnType<typeof mockFetch>;
let guest: Doc;

const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);

const addToken = (token: string, expiresAt: Date, usedAt: Date | null = null): Promise<Doc> =>
  ctx.local.create({
    collection: 'qr-tokens',
    data: {
      token,
      client: guest.id,
      expiresAt: expiresAt.toISOString(),
      ...(usedAt ? { usedAt: usedAt.toISOString() } : {}),
    },
    overrideAccess: true,
  });

const tokensLeft = async (): Promise<string[]> =>
  (await ctx.local.find({ collection: 'qr-tokens', depth: 0, limit: 100, overrideAccess: true })).docs
    .map((doc) => String(doc.token))
    .sort();

/** Отметка последней очистки в глобале `settings` (поле скрытое — читается с showHiddenFields). */
const cleanedAt = async (): Promise<string | null> => {
  const settings = (await ctx.payload.findGlobal({
    slug: 'settings',
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })) as unknown as Record<string, unknown>;
  const value = settings.qrTokensCleanedAt;

  return value ? new Date(String(value)).toISOString() : null;
};

/** A — истек час назад; B — истек двое суток назад и использован; C и D — действуют еще 4 мин, D использован. */
const seedTokens = async (): Promise<void> => {
  await addToken('qr-A', at(-HOUR));
  await addToken('qr-B', at(-2 * DAY), at(-2 * DAY - MINUTE));
  await addToken('qr-C', at(4 * MINUTE));
  await addToken('qr-D', at(4 * MINUTE), at(-MINUTE));
};

/** Первый проход и E, который истекает через 30 мин после него. */
const firstPassAndE = async (): Promise<void> => {
  await seedTokens();
  await runTick(ctx.payload, NOW);
  await addToken('qr-E', at(30 * MINUTE));
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
  // resetData глобалы не трогает: отметка прошлого теста сбрасывается здесь
  await ctx.local.updateGlobal({
    slug: 'settings',
    data: { timeZone: 'Europe/Kaliningrad', slotStepMin: 30, qrTokensCleanedAt: null },
    overrideAccess: true,
  });
  fetchMock = mockFetch();
  guest = await ctx.local.create({
    collection: 'clients',
    data: { name: 'Анна', platform: 'telegram', platformUserId: '7001' },
    overrideAccess: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('очистка просроченных QR гостей в задаче tick раз в сутки', () => {
  it('Q1 отметки нет: просроченные A и B (использованный тоже) удалены, действующие C и D на месте, отметка = now', async () => {
    await seedTokens();

    await runTick(ctx.payload, NOW);

    expect(await tokensLeft()).toEqual(['qr-C', 'qr-D']);
    expect(await cleanedAt()).toBe(NOW.toISOString());
  });

  it('Q2 повторный проход через час: E уже истек, но ничего не удалено, отметка не сдвинулась', async () => {
    await firstPassAndE();

    await runTick(ctx.payload, at(HOUR));

    expect(await tokensLeft()).toEqual(['qr-C', 'qr-D', 'qr-E']);
    expect(await cleanedAt()).toBe(NOW.toISOString());
  });

  it('Q3 через 23 ч 59 мин E на месте; ровно через 24 ч удалены E, C и D, отметка = now + 24 ч', async () => {
    await firstPassAndE();
    await runTick(ctx.payload, at(HOUR));

    await runTick(ctx.payload, at(DAY - MINUTE));

    expect(await tokensLeft()).toEqual(['qr-C', 'qr-D', 'qr-E']);
    expect(await cleanedAt()).toBe(NOW.toISOString());

    await runTick(ctx.payload, at(DAY));

    expect(await tokensLeft()).toEqual([]);
    expect(await cleanedAt()).toBe(at(DAY).toISOString());
  });

  it('Q4 в одном проходе созревшее напоминание отправлено и просроченный токен удален', async () => {
    const catalog = await createCatalog(ctx.local);
    const startAt = new Date(slotIso('10:00'));

    await createBookingVia(catalog, slotIso('10:00'), ANNA);
    await waitForQuiet(fetchMock.calls);
    fetchMock.clear();

    const now = new Date(startAt.getTime() - DAY + MINUTE);

    await addToken('qr-old', new Date(now.getTime() - HOUR));

    await runTick(ctx.payload, now);

    const telegram = fetchMock.telegramCalls();

    expect(telegram).toHaveLength(1);
    expect(String((telegram[0]!.body as { chat_id: unknown }).chat_id)).toBe(String(ANNA.userId));
    expect(await tokensLeft()).toEqual([]);
  });
});
