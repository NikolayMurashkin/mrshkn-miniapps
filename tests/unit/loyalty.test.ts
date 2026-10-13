import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateInitData } from '@/lib/init-data';
import { buildInitData, tamperInitData } from '../helpers/sign-init-data';

const SRC = path.resolve(import.meta.dirname, '../../src');

/** Модуля еще нет — тест падает на assert «нет src/…», а не на сборке файла. */
const importSrc = async <T>(relative: string): Promise<T> => {
  const file = path.join(SRC, relative);

  expect(existsSync(file), `нет src/${relative}`).toBe(true);

  return (await import(/* @vite-ignore */ file)) as T;
};

type ClientId = string | number;
type StampSource = 'scan' | 'referral';
type QrTokenRecord = { clientId: ClientId; expiresAt: Date; usedAt: Date | null };
type LoyaltyStore = {
  findQrToken(token: string): Promise<QrTokenRecord | null>;
  claimQrToken(token: string, now: Date): Promise<boolean>;
  countStamps(clientId: ClientId): Promise<number>;
  addStamp(clientId: ClientId, source: StampSource, now: Date): Promise<void>;
  issueCoupon(clientId: ClientId, now: Date): Promise<void>;
};
type ScanOutcome =
  | { result: 'accrued'; clientId: ClientId; stamps: number; couponIssued: boolean }
  | { result: 'duplicate'; clientId: ClientId; stamps: number }
  | { result: 'not-found' }
  | { result: 'expired' };
type LoyaltyModule = {
  accrueStamp(qrToken: string, store: LoyaltyStore, now: Date): Promise<ScanOutcome>;
  createQrToken(): string;
  parseReferralCode(startParam: string | undefined): string | null;
  buildReferralLink(platform: 'telegram' | 'max', botUsername: string, code: string): string | null;
};

const loadLoyalty = () => importSrc<LoyaltyModule>('lib/loyalty.ts');

const NOW = new Date('2030-03-12T12:00:00.000Z');
const LATER = new Date('2030-03-12T12:01:00.000Z');
const CLIENT_ID = 17;
const TOKEN = 'qr-token-anna-0000000000';
const FRESH_UNTIL = new Date(NOW.getTime() + 300_000);

/** Отдает управление: два параллельных вызова успевают прочитать токен до того, как один из них его пометит. */
const yieldTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** LoyaltyStore в памяти: claimQrToken атомарен — проверка и пометка без await между ними. */
const createMemoryStore = (input: { tokens?: Record<string, Omit<QrTokenRecord, 'usedAt'>>; stamps?: number } = {}) => {
  const tokens = new Map<string, QrTokenRecord>(
    Object.entries(input.tokens ?? {}).map(([token, record]) => [token, { ...record, usedAt: null }]),
  );
  const stamps: { clientId: ClientId; source: StampSource; at: Date }[] = Array.from(
    { length: input.stamps ?? 0 },
    () => ({ clientId: CLIENT_ID, source: 'scan' as const, at: NOW }),
  );
  const coupons: { clientId: ClientId; at: Date }[] = [];
  const calls = { addStamp: 0, issueCoupon: 0 };

  const store: LoyaltyStore = {
    findQrToken: async (token) => {
      await yieldTurn();
      const record = tokens.get(token);

      return record ? { ...record } : null;
    },
    claimQrToken: async (token, now) => {
      await yieldTurn();
      const record = tokens.get(token);

      if (!record || record.usedAt) {
        return false;
      }

      record.usedAt = now;

      return true;
    },
    countStamps: async (clientId) => {
      await yieldTurn();

      return stamps.filter((stamp) => stamp.clientId === clientId).length;
    },
    addStamp: async (clientId, source, now) => {
      await yieldTurn();
      calls.addStamp += 1;
      stamps.push({ clientId, source, at: now });
    },
    issueCoupon: async (clientId, now) => {
      await yieldTurn();
      calls.issueCoupon += 1;
      coupons.push({ clientId, at: now });
    },
  };

  return { store, tokens, stamps, coupons, calls };
};

const freshToken = { [TOKEN]: { clientId: CLIENT_ID, expiresAt: FRESH_UNTIL } };

describe('accrueStamp: начисление штампа по qrToken', () => {
  it('U1 токен выдан клиенту, не использован, не просрочен, штампов 0: accrued, stamps 1, без купона', async () => {
    const { accrueStamp } = await loadLoyalty();
    const memory = createMemoryStore({ tokens: freshToken });

    expect(await accrueStamp(TOKEN, memory.store, NOW)).toEqual({
      result: 'accrued',
      clientId: CLIENT_ID,
      stamps: 1,
      couponIssued: false,
    });
    expect(memory.stamps).toEqual([{ clientId: CLIENT_ID, source: 'scan', at: NOW }]);
    expect(memory.tokens.get(TOKEN)?.usedAt).toEqual(NOW);
    expect(memory.coupons).toEqual([]);
  });

  it('U2 тот же токен сканируют второй раз: duplicate, stamps 1, addStamp больше не вызывался', async () => {
    const { accrueStamp } = await loadLoyalty();
    const memory = createMemoryStore({ tokens: freshToken });

    await accrueStamp(TOKEN, memory.store, NOW);

    expect(await accrueStamp(TOKEN, memory.store, LATER)).toEqual({
      result: 'duplicate',
      clientId: CLIENT_ID,
      stamps: 1,
    });
    expect(memory.calls.addStamp).toBe(1);
    expect(memory.stamps).toHaveLength(1);
  });

  it('U3 два accrueStamp с одним токеном одновременно: один accrued, один duplicate, штамп один', async () => {
    const { accrueStamp } = await loadLoyalty();
    const memory = createMemoryStore({ tokens: freshToken });

    const outcomes = await Promise.all([accrueStamp(TOKEN, memory.store, NOW), accrueStamp(TOKEN, memory.store, NOW)]);

    expect(outcomes.map((outcome) => outcome.result).sort()).toEqual(['accrued', 'duplicate']);
    expect(memory.stamps).toHaveLength(1);
    expect(memory.calls.addStamp).toBe(1);
  });

  it('U4 у клиента 9 штампов, скан нового токена: купон выдан, карта с нуля; повтор токена второго купона не дает', async () => {
    const { accrueStamp } = await loadLoyalty();
    const memory = createMemoryStore({ tokens: freshToken, stamps: 9 });

    expect(await accrueStamp(TOKEN, memory.store, NOW)).toEqual({
      result: 'accrued',
      clientId: CLIENT_ID,
      stamps: 0,
      couponIssued: true,
    });
    expect(memory.calls.issueCoupon).toBe(1);
    expect(memory.coupons).toEqual([{ clientId: CLIENT_ID, at: NOW }]);

    expect(await accrueStamp(TOKEN, memory.store, LATER)).toEqual({
      result: 'duplicate',
      clientId: CLIENT_ID,
      stamps: 0,
    });
    expect(memory.calls.issueCoupon).toBe(1);
    expect(memory.coupons).toHaveLength(1);
    expect(memory.stamps).toHaveLength(10);
  });

  it('U4b у клиента 19 штампов (один купон уже выдан), скан нового токена: второй купон, карта с нуля', async () => {
    const { accrueStamp } = await loadLoyalty();
    const memory = createMemoryStore({ tokens: freshToken, stamps: 19 });

    expect(await accrueStamp(TOKEN, memory.store, NOW)).toEqual({
      result: 'accrued',
      clientId: CLIENT_ID,
      stamps: 0,
      couponIssued: true,
    });
    expect(memory.calls.issueCoupon).toBe(1);
    expect(memory.stamps).toHaveLength(20);
  });

  it('U5 токена нет: not-found, хранилище не менялось; токен просрочен: expired, не помечен, штампа нет', async () => {
    const { accrueStamp } = await loadLoyalty();
    const memory = createMemoryStore({ tokens: freshToken });

    expect(await accrueStamp('no-such-token-000000000', memory.store, NOW)).toEqual({ result: 'not-found' });
    expect(memory.stamps).toEqual([]);
    expect(memory.coupons).toEqual([]);
    expect(memory.tokens.get(TOKEN)?.usedAt).toBeNull();

    const expired = createMemoryStore({
      tokens: { [TOKEN]: { clientId: CLIENT_ID, expiresAt: new Date(NOW.getTime() - 1000) } },
    });

    expect(await accrueStamp(TOKEN, expired.store, NOW)).toEqual({ result: 'expired' });
    expect(expired.tokens.get(TOKEN)?.usedAt).toBeNull();
    expect(expired.stamps).toEqual([]);
    expect(expired.calls.addStamp).toBe(0);
  });
});

describe('QR-токен и реферальная ссылка', () => {
  it('U6 createQrToken: 100 вызовов — все разные, каждый base64url не короче 22 символов', async () => {
    const { createQrToken } = await loadLoyalty();
    const tokens = Array.from({ length: 100 }, () => createQrToken());

    expect(new Set(tokens).size).toBe(100);
    tokens.forEach((token) => expect(token).toMatch(/^[A-Za-z0-9_-]{22,}$/));
  });

  it('U7 parseReferralCode и buildReferralLink', async () => {
    const { parseReferralCode, buildReferralLink } = await loadLoyalty();

    expect(parseReferralCode('ref_Ab3_x-9Q')).toBe('Ab3_x-9Q');

    for (const startParam of [undefined, '', 'ref_', 'ref_abc', 'promo_abcdef', 'ref_абвгде']) {
      expect(parseReferralCode(startParam), String(startParam)).toBeNull();
    }

    expect(buildReferralLink('telegram', 'coffee_bot', 'Ab3_x-9Q')).toBe(
      'https://t.me/coffee_bot?startapp=ref_Ab3_x-9Q',
    );
    expect(buildReferralLink('max', 'coffee_bot', 'Ab3_x-9Q')).toBe('https://max.ru/coffee_bot?startapp=ref_Ab3_x-9Q');
    expect(buildReferralLink('telegram', '', 'Ab3_x-9Q')).toBeNull();
    expect(buildReferralLink('max', '', 'Ab3_x-9Q')).toBeNull();
  });
});

describe('validateInitData: start_param', () => {
  const BOT_TOKEN = '123456:TELEGRAM-test-token';
  const OPTIONS = { now: NOW, maxAgeSec: 86400 };
  const AUTH_DATE = new Date('2030-03-12T11:59:00.000Z');
  const USER = { id: 4242, first_name: 'Анна' };
  const startParamOf = (result: unknown): unknown => (result as { startParam?: unknown }).startParam;

  it('U8 подписанный start_param: ok и startParam; без поля — startParam нет; подмена после подписи — bad-hash', () => {
    const withRef = buildInitData({
      botToken: BOT_TOKEN,
      user: USER,
      authDate: AUTH_DATE,
      extra: { start_param: 'ref_Ab3_x-9Q' },
    });
    const result = validateInitData(withRef, BOT_TOKEN, OPTIONS);

    expect(result.ok).toBe(true);
    expect(startParamOf(result)).toBe('ref_Ab3_x-9Q');

    const plain = validateInitData(
      buildInitData({ botToken: BOT_TOKEN, user: USER, authDate: AUTH_DATE }),
      BOT_TOKEN,
      OPTIONS,
    );

    expect(plain.ok).toBe(true);
    expect(startParamOf(plain)).toBeUndefined();

    expect(validateInitData(tamperInitData(withRef, 'start_param', 'ref_Zz9_y-8W'), BOT_TOKEN, OPTIONS)).toEqual({
      ok: false,
      reason: 'bad-hash',
    });
  });
});

type GuestCard = {
  role: 'guest';
  stamps: number;
  stampsPerCoupon: number;
  coupons: { id: number; status: 'active' }[];
  referralLink: string | null;
};
type CardNotice = 'stamp' | 'coupon' | 'redeemed';

describe('фронт карты гостя: формы слов и заметка после скана', () => {
  it('U9 plural: 1 штамп, 2 штампа, 5 штампов, 11–14 штампов, 21 штамп, 22 штампа, 111 штампов, 0 штампов', async () => {
    const { plural } = await importSrc<{ plural(count: number, words: [string, string, string]): string }>(
      'loyalty/format.ts',
    );
    const words: [string, string, string] = ['штамп', 'штампа', 'штампов'];
    const cases: [number, string][] = [
      [0, 'штампов'],
      [1, 'штамп'],
      [2, 'штампа'],
      [4, 'штампа'],
      [5, 'штампов'],
      [11, 'штампов'],
      [12, 'штампов'],
      [14, 'штампов'],
      [21, 'штамп'],
      [22, 'штампа'],
      [111, 'штампов'],
    ];

    for (const [count, word] of cases) {
      expect(plural(count, words), String(count)).toBe(word);
    }
  });

  it('U11 noticeFor: купон прибавился — coupon; убавился — redeemed; изменились только штампы — stamp; ничего — null', async () => {
    const { noticeFor } = await importSrc<{ noticeFor(before: GuestCard, after: GuestCard): CardNotice | null }>(
      'loyalty/card-notice.ts',
    );
    const card = (stamps: number, couponIds: number[]): GuestCard => ({
      role: 'guest',
      stamps,
      stampsPerCoupon: 10,
      coupons: couponIds.map((id) => ({ id, status: 'active' })),
      referralLink: null,
    });

    expect(noticeFor(card(9, []), card(0, [1]))).toBe('coupon');
    expect(noticeFor(card(3, [1]), card(3, []))).toBe('redeemed');
    expect(noticeFor(card(3, []), card(4, []))).toBe('stamp');
    expect(noticeFor(card(3, [1]), card(3, [1]))).toBeNull();
  });
});
