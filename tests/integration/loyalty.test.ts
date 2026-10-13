import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { tamperInitData } from '../helpers/sign-init-data';
import {
  MAX_BASE,
  MAX_TOKEN,
  OWNER_CHAT_ID,
  TELEGRAM_BOT_USERNAME,
  callMiniApp,
  createStaff,
  initDataFor,
  initPayload,
  messagesTo,
  mockFetch,
  requireCollections,
  resetData,
  stubEnv,
  waitForQuiet,
  type HttpMethod,
  type TestPayload,
  type Who,
} from './fixtures';

const STAFF: Who = { platform: 'telegram', userId: 5001 };
const STAFF_NAME = 'Вера';
const RETIRED_STAFF: Who = { platform: 'telegram', userId: 5002 };
const ANNA: Who = { platform: 'telegram', userId: 4242 };
const BORIS: Who = { platform: 'telegram', userId: 4343 };
const OLEG_MAX: Who = { platform: 'max', userId: 9001 };
const GLEB: Who = { platform: 'telegram', userId: 4444 };
const DINA: Who = { platform: 'telegram', userId: 4545 };
const STAMPS_PER_COUPON = 10;

type Coupon = { id: string | number; status: string };
type GuestMe = {
  role: string;
  stamps: number;
  stampsPerCoupon: number;
  coupons: Coupon[];
  referralLink: string | null;
};
type ScanBody = { result: string; guest: { name: string }; stamps: number; couponIssued: boolean; coupons: Coupon[] };
type HistoryEvent = { type: string; at: string };

let ctx: TestPayload;
let fetchMock: ReturnType<typeof mockFetch>;

const readJson = async <T>(response: Response, status: number): Promise<T> => {
  expect(response.status).toBe(status);

  return (await response.json()) as T;
};

const refParam = (code: string) => ({ start_param: `ref_${code}` });

const me = (who: Who, extra?: Record<string, string>) => callMiniApp('loyalty/me', 'GET', { who, extra });
const meOk = async (who: Who, extra?: Record<string, string>) => readJson<GuestMe>(await me(who, extra), 200);

const issueQr = async (who: Who): Promise<string> =>
  (await readJson<{ qrToken: string }>(await callMiniApp('loyalty/qr', 'POST', { who }), 201)).qrToken;

const scan = (qrToken: string, by: Who = STAFF) => callMiniApp('staff/scan', 'POST', { who: by, body: { qrToken } });
const scanOk = async (qrToken: string): Promise<ScanBody> => readJson<ScanBody>(await scan(qrToken), 200);

/** Гость n раз показывает новый QR, кассир сканирует каждый; ответы сканов по порядку. */
const scanTimes = async (who: Who, n: number): Promise<ScanBody[]> => {
  const bodies: ScanBody[] = [];

  for (let i = 0; i < n; i += 1) {
    bodies.push(await scanOk(await issueQr(who)));
  }

  return bodies;
};

const history = async (who: Who): Promise<HistoryEvent[]> =>
  (await readJson<{ events: HistoryEvent[] }>(await callMiniApp('loyalty/history', 'GET', { who }), 200)).events;

const eventsOf = (events: HistoryEvent[], type: string) => events.filter((event) => event.type === type);

const redeem = (id: string | number, by: Who = STAFF) =>
  callMiniApp('staff/coupons/[id]/redeem', 'POST', { who: by, params: { id: String(id) } });

/** Код из реферальной ссылки Telegram: `https://t.me/<бот>?startapp=ref_<код>`. */
const referralCodeOf = (link: string | null): string => {
  const prefix = `https://t.me/${TELEGRAM_BOT_USERNAME}?startapp=ref_`;

  expect(link?.startsWith(prefix), `referralLink: ${link}`).toBe(true);

  const code = (link ?? '').slice(prefix.length);

  expect(code).toMatch(/^[A-Za-z0-9_-]{6,32}$/);

  return code;
};

/** Кассир в админке; защите маршрутов (G1) он не нужен: 401 приходит раньше проверки роли. */
const addStaff = async () => {
  requireCollections(ctx, ['staff']);
  await createStaff(ctx.local, { ...STAFF, name: STAFF_NAME });
};

const couponMessages = (who: Who) =>
  messagesTo(fetchMock.calls, who).filter((text) => text.toLowerCase().includes('купон'));

beforeAll(async () => {
  ctx = await initPayload();
});

afterAll(async () => {
  await ctx.payload.destroy();
});

beforeEach(async () => {
  stubEnv();
  await resetData(ctx);
  fetchMock = mockFetch();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('штампы по QR: купон за 10-й, уведомление, погашение', () => {
  beforeEach(addStaff);

  it('L1 10-й штамп гостю Telegram: купон в ответе, в карте и истории, одно уведомление со словом «купон» только после 10-го', async () => {
    await meOk(ANNA);

    const nine = await scanTimes(ANNA, STAMPS_PER_COUPON - 1);

    nine.forEach((body, index) =>
      expect(body, `скан ${index + 1}`).toMatchObject({ result: 'accrued', stamps: index + 1, couponIssued: false }),
    );
    await waitForQuiet(fetchMock.calls);
    expect(messagesTo(fetchMock.calls, ANNA)).toEqual([]);

    const [tenth] = await scanTimes(ANNA, 1);

    expect(tenth).toMatchObject({ result: 'accrued', couponIssued: true, stamps: 0 });
    expect(tenth!.coupons).toHaveLength(1);
    expect(tenth!.coupons[0]).toMatchObject({ status: 'active' });

    const card = await meOk(ANNA);

    expect(card).toMatchObject({ role: 'guest', stamps: 0, stampsPerCoupon: STAMPS_PER_COUPON });
    expect(card.coupons).toHaveLength(1);
    expect(card.coupons[0]).toMatchObject({ status: 'active' });

    const events = await history(ANNA);
    const issued = eventsOf(events, 'coupon-issued');
    const stamps = eventsOf(events, 'stamp');

    expect(issued).toHaveLength(1);
    expect(stamps).toHaveLength(STAMPS_PER_COUPON);

    const lastStampAt = Math.max(...stamps.map((event) => new Date(event.at).getTime()));

    expect(new Date(issued[0]!.at).getTime()).toBeGreaterThanOrEqual(lastStampAt);

    await vi.waitFor(() => expect(messagesTo(fetchMock.calls, ANNA)).toHaveLength(1));
    await waitForQuiet(fetchMock.calls);

    const toGuest = messagesTo(fetchMock.calls, ANNA);

    expect(toGuest).toHaveLength(1);
    expect(toGuest[0]!.toLowerCase()).toContain('купон');
  });

  it('L2 то же для гостя MAX: уведомление в MAX /messages?user_id=9001 с Authorization, гостю в Telegram ничего', async () => {
    await meOk(OLEG_MAX);

    const bodies = await scanTimes(OLEG_MAX, STAMPS_PER_COUPON);

    expect(bodies.at(-1)).toMatchObject({ result: 'accrued', couponIssued: true, stamps: 0 });

    await vi.waitFor(() => expect(fetchMock.maxCalls()).toHaveLength(1));
    await waitForQuiet(fetchMock.calls);

    const [call] = fetchMock.maxCalls();

    expect(fetchMock.maxCalls()).toHaveLength(1);
    expect(call!.url).toBe(`${MAX_BASE}/messages?user_id=${OLEG_MAX.userId}`);
    expect(call!.headers.get('authorization')).toBe(MAX_TOKEN);
    expect(String((call!.body as { text?: unknown }).text).toLowerCase()).toContain('купон');
    expect(
      fetchMock
        .telegramCalls()
        .filter((telegram) => String((telegram.body as { chat_id?: unknown }).chat_id) !== OWNER_CHAT_ID),
    ).toEqual([]);
  });

  it('L3 повторный скан того же qrToken: 200 duplicate, штамп один; два скана одного токена параллельно — штамп один', async () => {
    await meOk(ANNA);

    const token = await issueQr(ANNA);

    expect(await scanOk(token)).toMatchObject({ result: 'accrued', stamps: 1 });
    expect(await readJson<ScanBody>(await scan(token), 200)).toMatchObject({ result: 'duplicate', stamps: 1 });
    expect((await meOk(ANNA)).stamps).toBe(1);
    expect(eventsOf(await history(ANNA), 'stamp')).toHaveLength(1);

    const shared = await issueQr(ANNA);
    const responses = await Promise.all([scan(shared), scan(shared)]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);

    const results = (await Promise.all(responses.map((response) => response.json()))) as ScanBody[];

    expect(results.map((body) => body.result).sort()).toEqual(['accrued', 'duplicate']);
    expect((await meOk(ANNA)).stamps).toBe(2);
    expect(eventsOf(await history(ANNA), 'stamp')).toHaveLength(2);
  });

  it('L4 скан не кассиром и неактивным кассиром — 403, неизвестный токен — 404, просроченный — 410; штампа нет', async () => {
    const consts = (await import('@/lib/consts')) as unknown as Record<string, unknown>;

    expect(typeof consts.QR_TOKEN_TTL_SEC, 'нет QR_TOKEN_TTL_SEC в src/lib/consts.ts').toBe('number');

    const ttlSec = consts.QR_TOKEN_TTL_SEC as number;

    await meOk(ANNA);

    const own = await issueQr(ANNA);

    expect((await scan(own, ANNA)).status).toBe(403);

    await createStaff(ctx.local, { ...RETIRED_STAFF, name: 'Бывший кассир', active: false });

    expect((await scan(own, RETIRED_STAFF)).status).toBe(403);
    expect((await scan('no-such-token-0000000000')).status).toBe(404);

    const stale = await issueQr(ANNA);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + (ttlSec + 1) * 1000);

    expect((await scan(stale)).status).toBe(410);

    vi.useRealTimers();

    expect((await meOk(ANNA)).stamps).toBe(0);
    expect(eventsOf(await history(ANNA), 'stamp')).toHaveLength(0);
  });

  it('L5 погашение: купон в ответе скана, кассир гасит — 200, купон пропал, в истории coupon-redeemed; повтор 409, гость 403, нет купона 404', async () => {
    await meOk(ANNA);
    await scanTimes(ANNA, STAMPS_PER_COUPON);

    const [shown] = await scanTimes(ANNA, 1);

    expect(shown!.coupons).toHaveLength(1);
    expect(shown!.coupons[0]).toMatchObject({ status: 'active' });

    const couponId = shown!.coupons[0]!.id;

    expect((await redeem(couponId, ANNA)).status).toBe(403);
    expect((await meOk(ANNA)).coupons).toHaveLength(1);

    expect(await readJson(await redeem(couponId), 200)).toMatchObject({ status: 'redeemed' });
    expect((await meOk(ANNA)).coupons).toEqual([]);
    expect(eventsOf(await history(ANNA), 'coupon-redeemed')).toHaveLength(1);

    expect((await redeem(couponId)).status).toBe(409);
    expect((await redeem('999999')).status).toBe(404);
    expect(eventsOf(await history(ANNA), 'coupon-redeemed')).toHaveLength(1);
  });

  it('L6 GET /loyalty/me от кассира: { role: staff, name }, клиента с его ID не создано', async () => {
    expect(await readJson(await me(STAFF), 200)).toEqual({ role: 'staff', name: STAFF_NAME });

    const { totalDocs } = await ctx.local.find({
      collection: 'clients',
      where: { platformUserId: { equals: String(STAFF.userId) } },
      depth: 0,
      overrideAccess: true,
    });

    expect(totalDocs).toBe(0);
  });

  it('L7 у BORIS 10 штампов и купон, у ANNA 1 штамп: карта и история ANNA содержат только ее штамп', async () => {
    await meOk(ANNA);
    await meOk(BORIS);
    await scanTimes(ANNA, 1);
    await scanTimes(BORIS, STAMPS_PER_COUPON);

    expect((await meOk(BORIS)).coupons).toHaveLength(1);

    const card = await meOk(ANNA);

    expect(card).toMatchObject({ stamps: 1, coupons: [] });

    const events = await history(ANNA);

    expect(events.map((event) => event.type)).toEqual(['stamp']);
  });
});

type ProtectedRoute = {
  route: string;
  method: HttpMethod;
  body?: unknown;
  params?: Record<string, string>;
};

const PROTECTED_ROUTES: ProtectedRoute[] = [
  { route: 'loyalty/me', method: 'GET' },
  { route: 'loyalty/qr', method: 'POST' },
  { route: 'loyalty/history', method: 'GET' },
  { route: 'menu', method: 'GET' },
  { route: 'orders', method: 'GET' },
  { route: 'orders', method: 'POST', body: { items: [{ id: 1, qty: 1 }], pickup: 'asap' } },
  { route: 'staff/scan', method: 'POST', body: { qrToken: 'any-token-000000000000' } },
  { route: 'staff/coupons/[id]/redeem', method: 'POST', params: { id: '1' } },
  { route: 'staff/orders', method: 'GET' },
  { route: 'staff/orders/[id]/status', method: 'POST', body: { status: 'preparing' }, params: { id: '1' } },
];

/** Подпись кассира: 401 обязан прийти от проверки initData, а не от роли. */
const AUTH_FAILURES = [
  { failure: 'без заголовков', auth: () => ({ initData: null, platform: null }) },
  {
    failure: 'испорченная подпись',
    auth: () => ({
      initData: tamperInitData(
        initDataFor(STAFF.platform, STAFF.userId),
        'user',
        JSON.stringify({ id: STAFF.userId + 1 }),
      ),
      platform: STAFF.platform,
    }),
  },
  {
    failure: 'просроченная initData',
    auth: () => ({
      initData: initDataFor(STAFF.platform, STAFF.userId, new Date(Date.now() - 25 * 3_600_000)),
      platform: STAFF.platform,
    }),
  },
];

describe('защита новых маршрутов', () => {
  it.each(PROTECTED_ROUTES.flatMap((route) => AUTH_FAILURES.map((failure) => ({ ...route, ...failure }))))(
    'G1 $method $route, $failure: 401',
    async ({ route, method, body, params, auth }) => {
      const response = await callMiniApp(route, method, { auth: auth(), body, params });

      expect(response.status).toBe(401);
    },
  );
});

describe('реферальная ссылка: бонус пригласившему один раз', () => {
  beforeEach(addStaff);

  it('R1 новый гость входит по ссылке ANNA: у ANNA 1 штамп и событие referral, у нового гостя 0', async () => {
    const code = referralCodeOf((await meOk(ANNA)).referralLink);

    expect((await meOk(BORIS, refParam(code))).stamps).toBe(0);
    expect((await meOk(ANNA)).stamps).toBe(1);
    expect(eventsOf(await history(ANNA), 'referral')).toHaveLength(1);
    expect((await meOk(BORIS)).stamps).toBe(0);
  });

  it('R2 два первых входа одновременно, повторные входы с той же ссылкой и другие маршруты: бонус один', async () => {
    const code = referralCodeOf((await meOk(ANNA)).referralLink);
    const ref = refParam(code);
    const firstVisits = await Promise.all([me(BORIS, ref), me(BORIS, ref)]);

    expect(firstVisits.map((response) => response.status)).toEqual([200, 200]);
    expect((await meOk(ANNA)).stamps).toBe(1);

    await meOk(BORIS, ref);
    await meOk(BORIS, ref);
    await readJson(await callMiniApp('loyalty/qr', 'POST', { who: BORIS, extra: ref }), 201);
    await readJson(await callMiniApp('loyalty/history', 'GET', { who: BORIS, extra: ref }), 200);
    await readJson(await callMiniApp('menu', 'GET', { who: BORIS, extra: ref }), 200);
    await readJson(await callMiniApp('orders', 'GET', { who: BORIS, extra: ref }), 200);

    expect((await meOk(ANNA)).stamps).toBe(1);
    expect(eventsOf(await history(ANNA), 'referral')).toHaveLength(1);
  });

  it('R3 знакомый гость по ссылке, ANNA по своей ссылке, неизвестный код, start_param не ref_: 200, бонусов нет', async () => {
    const code = referralCodeOf((await meOk(ANNA)).referralLink);

    await meOk(OLEG_MAX);

    expect((await meOk(OLEG_MAX, refParam(code))).stamps).toBe(0);
    expect((await meOk(ANNA, refParam(code))).stamps).toBe(0);
    expect((await meOk(GLEB, { start_param: 'ref_Unknown99' })).stamps).toBe(0);
    expect((await meOk(DINA, { start_param: 'promo_abcdef' })).stamps).toBe(0);

    expect((await meOk(ANNA)).stamps).toBe(0);
    expect(eventsOf(await history(ANNA), 'referral')).toHaveLength(0);
    expect((await meOk(OLEG_MAX)).stamps).toBe(0);
  });

  it('R4 у ANNA 9 штампов, по ее ссылке пришел новый гость: купон выдан, уведомление со словом «купон»', async () => {
    const code = referralCodeOf((await meOk(ANNA)).referralLink);

    await scanTimes(ANNA, STAMPS_PER_COUPON - 1);
    await waitForQuiet(fetchMock.calls);
    expect(couponMessages(ANNA)).toEqual([]);

    await meOk(BORIS, refParam(code));

    const card = await meOk(ANNA);

    expect(card.stamps).toBe(0);
    expect(card.coupons).toHaveLength(1);
    expect(card.coupons[0]).toMatchObject({ status: 'active' });
    expect(eventsOf(await history(ANNA), 'coupon-issued')).toHaveLength(1);

    await vi.waitFor(() => expect(couponMessages(ANNA)).toHaveLength(1));
  });

  it('R6 бонус ANNA не записался при первом входе BORIS: BORIS не создан; повторный вход — BORIS создан, бонус ANNA один', async () => {
    const code = referralCodeOf((await meOk(ANNA)).referralLink);
    const create = ctx.payload.create.bind(ctx.payload);
    const failing = vi
      .spyOn(ctx.payload, 'create')
      .mockImplementation(((args: { collection: string }) =>
        args.collection === 'loyalty-events'
          ? Promise.reject(new Error('сбой базы на бонусе'))
          : create(args as Parameters<typeof create>[0])) as typeof ctx.payload.create);

    const status = await me(BORIS, refParam(code)).then(
      (response) => response.status,
      () => 500,
    );

    failing.mockRestore();

    expect(status).not.toBe(200);

    const { totalDocs } = await ctx.local.find({
      collection: 'clients',
      where: { platformUserId: { equals: String(BORIS.userId) } },
      depth: 0,
      overrideAccess: true,
    });

    expect(totalDocs, 'BORIS без бонуса ANNA не создается').toBe(0);
    expect((await meOk(BORIS, refParam(code))).stamps).toBe(0);
    expect((await meOk(ANNA)).stamps).toBe(1);
    expect(eventsOf(await history(ANNA), 'referral')).toHaveLength(1);
  });

  it('R5 TELEGRAM_BOT_USERNAME пуст: referralLink null, ответ 200', async () => {
    vi.stubEnv('TELEGRAM_BOT_USERNAME', '');

    const card = await meOk(ANNA);

    expect(card.role).toBe('guest');
    expect(card.referralLink).toBeNull();
  });
});
