import { describe, expect, it } from 'vitest';
import { validateInitData } from '@/lib/init-data';
import { appendInitDataField, buildInitData, dropInitDataField, tamperInitData } from '../helpers/sign-init-data';

const TELEGRAM_TOKEN = '123456:TELEGRAM-test-token';
const MAX_TOKEN = 'max-test-token-987';
const NOW = new Date('2030-03-12T12:00:00.000Z');
const MAX_AGE_SEC = 86400;
const OPTIONS = { now: NOW, maxAgeSec: MAX_AGE_SEC };
const AUTH_DATE = new Date('2030-03-12T11:59:00.000Z');
const USER = { id: 4242, first_name: 'Анна', last_name: 'Иванова', username: 'anna_test' };

const platforms = [
  { name: 'telegram', token: TELEGRAM_TOKEN, otherToken: MAX_TOKEN },
  { name: 'max', token: MAX_TOKEN, otherToken: TELEGRAM_TOKEN },
];

describe('validateInitData', () => {
  it('1.1 initData Telegram, подписанная токеном Telegram: ok, user.id из поля user', () => {
    const raw = buildInitData({ botToken: TELEGRAM_TOKEN, user: USER, authDate: AUTH_DATE });

    expect(validateInitData(raw, TELEGRAM_TOKEN, OPTIONS)).toEqual({
      ok: true,
      user: { id: 4242, firstName: 'Анна', lastName: 'Иванова', username: 'anna_test' },
      authDate: AUTH_DATE,
    });
  });

  it('1.2 initData MAX, подписанная токеном MAX: ok, user.id', () => {
    const raw = buildInitData({ botToken: MAX_TOKEN, user: { id: 9001, first_name: 'Олег' }, authDate: AUTH_DATE });
    const result = validateInitData(raw, MAX_TOKEN, OPTIONS);

    expect(result.ok).toBe(true);
    expect(result.ok && result.user.id).toBe(9001);
    expect(result.ok && result.user.firstName).toBe('Олег');
  });

  it.each(platforms)('1.3 $name: после подписи изменено поле user: bad-hash', ({ token }) => {
    const raw = buildInitData({ botToken: token, user: USER, authDate: AUTH_DATE });
    const tampered = tamperInitData(raw, 'user', JSON.stringify({ ...USER, id: 1 }));

    expect(validateInitData(tampered, token, OPTIONS)).toEqual({ ok: false, reason: 'bad-hash' });
  });

  it.each(platforms)('1.4 $name: данные подписаны токеном другой платформы: bad-hash', ({ token, otherToken }) => {
    const raw = buildInitData({ botToken: otherToken, user: USER, authDate: AUTH_DATE });

    expect(validateInitData(raw, token, OPTIONS)).toEqual({ ok: false, reason: 'bad-hash' });
  });

  it('1.5 нет hash: missing-hash', () => {
    const raw = buildInitData({ botToken: TELEGRAM_TOKEN, user: USER, authDate: AUTH_DATE });

    expect(validateInitData(dropInitDataField(raw, 'hash'), TELEGRAM_TOKEN, OPTIONS)).toEqual({
      ok: false,
      reason: 'missing-hash',
    });
  });

  it('1.6 ключ встречается дважды: malformed', () => {
    const raw = buildInitData({ botToken: TELEGRAM_TOKEN, user: USER, authDate: AUTH_DATE });
    const duplicated = appendInitDataField(raw, 'auth_date', String(Math.floor(AUTH_DATE.getTime() / 1000)));

    expect(validateInitData(duplicated, TELEGRAM_TOKEN, OPTIONS)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('1.7 auth_date старше maxAgeSec: expired; на 1 с моложе границы: ok', () => {
    const tooOld = new Date(NOW.getTime() - (MAX_AGE_SEC + 1) * 1000);
    const justFresh = new Date(NOW.getTime() - (MAX_AGE_SEC - 1) * 1000);

    expect(
      validateInitData(
        buildInitData({ botToken: TELEGRAM_TOKEN, user: USER, authDate: tooOld }),
        TELEGRAM_TOKEN,
        OPTIONS,
      ),
    ).toEqual({ ok: false, reason: 'expired' });
    expect(
      validateInitData(
        buildInitData({ botToken: TELEGRAM_TOKEN, user: USER, authDate: justFresh }),
        TELEGRAM_TOKEN,
        OPTIONS,
      ).ok,
    ).toBe(true);
  });

  it('1.8 initData Telegram с полем signature (входит в подпись): ok', () => {
    const raw = buildInitData({
      botToken: TELEGRAM_TOKEN,
      user: USER,
      authDate: AUTH_DATE,
      extra: { signature: 'dGVzdC1zaWduYXR1cmUtdmFsdWU', query_id: 'AAHdF6IQAAAAAN0XohDhrOrc' },
    });
    const result = validateInitData(raw, TELEGRAM_TOKEN, OPTIONS);

    expect(result.ok).toBe(true);
    expect(result.ok && result.user.id).toBe(4242);
  });
});
