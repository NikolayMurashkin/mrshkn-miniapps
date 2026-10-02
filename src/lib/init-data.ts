import { createHmac, timingSafeEqual } from 'node:crypto';

export type InitDataResult =
  | { ok: true; user: { id: number; firstName?: string; lastName?: string; username?: string }; authDate: Date }
  | { ok: false; reason: 'malformed' | 'missing-hash' | 'bad-hash' | 'expired' };

const malformed: InitDataResult = { ok: false, reason: 'malformed' };

const hashMatches = (expectedHex: string, actualHex: string): boolean => {
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(actualHex, 'hex');

  return (
    actualHex.length === expectedHex.length && actual.length === expected.length && timingSafeEqual(expected, actual)
  );
};

export const validateInitData = (
  raw: string,
  botToken: string,
  options: { now: Date; maxAgeSec: number },
): InitDataResult => {
  const fields = new Map<string, string>();

  for (const [key, value] of new URLSearchParams(raw)) {
    if (fields.has(key)) {
      return malformed;
    }

    fields.set(key, value);
  }

  const hash = fields.get('hash');

  if (!hash) {
    return { ok: false, reason: 'missing-hash' };
  }

  const dataCheckString = [...fields.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex');

  if (!hashMatches(expected, hash.toLowerCase())) {
    return { ok: false, reason: 'bad-hash' };
  }

  const authSec = Number(fields.get('auth_date'));
  let user: { id?: unknown; first_name?: unknown; last_name?: unknown; username?: unknown };

  try {
    user = JSON.parse(fields.get('user') ?? '');
  } catch {
    return malformed;
  }

  if (!Number.isFinite(authSec) || typeof user?.id !== 'number') {
    return malformed;
  }

  const authDate = new Date(authSec * 1000);

  if (options.now.getTime() - authDate.getTime() > options.maxAgeSec * 1000) {
    return { ok: false, reason: 'expired' };
  }

  const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

  return {
    ok: true,
    user: {
      id: user.id,
      firstName: text(user.first_name),
      lastName: text(user.last_name),
      username: text(user.username),
    },
    authDate,
  };
};
