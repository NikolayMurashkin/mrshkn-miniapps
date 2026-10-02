import { createHmac } from 'node:crypto';

/**
 * Подпись initData по алгоритму документации Telegram и MAX (одинаков для обеих), независимо от реализации:
 * secret = HMAC_SHA256(key='WebAppData', msg=botToken); строка проверки — пары кроме hash, по ключу, через \n;
 * hash = hex(HMAC_SHA256(key=secret, msg=строка)).
 */
export const computeInitDataHash = (botToken: string, fields: Record<string, string>): string => {
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const dataCheckString = Object.entries(fields)
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  return createHmac('sha256', secret).update(dataCheckString).digest('hex');
};

/** Строка initData (query-string) с корректным hash. */
export const signInitData = (botToken: string, fields: Record<string, string>): string => {
  const params = new URLSearchParams(fields);

  params.set('hash', computeInitDataHash(botToken, fields));

  return params.toString();
};

export type TestUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type BuildInitDataInput = {
  botToken: string;
  user: TestUser;
  authDate: Date;
  /** Дополнительные поля, входящие в подпись (query_id, signature, ...). */
  extra?: Record<string, string>;
};

export const buildInitData = ({ botToken, user, authDate, extra = {} }: BuildInitDataInput): string =>
  signInitData(botToken, {
    ...extra,
    auth_date: String(Math.floor(authDate.getTime() / 1000)),
    user: JSON.stringify(user),
  });

/** Меняет значение поля, оставляя прежний hash (подпись становится испорченной). */
export const tamperInitData = (raw: string, key: string, value: string): string => {
  const params = new URLSearchParams(raw);

  params.set(key, value);

  return params.toString();
};

export const dropInitDataField = (raw: string, key: string): string => {
  const params = new URLSearchParams(raw);

  params.delete(key);

  return params.toString();
};

/** Добавляет еще одно вхождение ключа (дубль). */
export const appendInitDataField = (raw: string, key: string, value: string): string =>
  `${raw}&${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
