import { INIT_DATA_MAX_AGE_SEC, PLATFORMS } from './consts';
import { botToken } from './env';
import { validateInitData } from './init-data';
import type { MiniAppAuth, Platform } from './types';

const TMA_PREFIX = /^tma\s+/i;

const isPlatform = (value: string | null): value is Platform => PLATFORMS.some((platform) => platform === value);

/** null - любой отказ: нет заголовков, неизвестная платформа, пустой токен, плохая или просроченная подпись. */
export const authenticate = (req: Request, now: Date = new Date()): MiniAppAuth | null => {
  const platform = req.headers.get('X-Mini-App-Platform');
  const authorization = req.headers.get('Authorization');

  if (!isPlatform(platform) || !authorization || !TMA_PREFIX.test(authorization)) {
    return null;
  }

  const token = botToken(platform);

  if (!token) {
    return null;
  }

  const result = validateInitData(authorization.replace(TMA_PREFIX, ''), token, {
    now,
    maxAgeSec: INIT_DATA_MAX_AGE_SEC,
  });

  if (!result.ok) {
    return null;
  }

  return { platform, user: result.user, ...(result.startParam ? { startParam: result.startParam } : {}) };
};

export const unauthorized = (): Response => Response.json({ error: 'unauthorized' }, { status: 401 });
