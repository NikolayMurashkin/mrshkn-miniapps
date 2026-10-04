import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCatalog, getCatalog, initDataFor, initPayload, resetData, stubEnv, type TestPayload } from './fixtures';

/** Пояс, отличный от умолчания (`Europe/Kaliningrad`): иначе ответ совпал бы и без поля из настроек. */
const BUSINESS_TIME_ZONE = 'Asia/Yekaterinburg';
const CLIENT_ID = 4545;

let ctx: TestPayload;

beforeAll(async () => {
  ctx = await initPayload();
});

afterAll(async () => {
  await ctx.payload.destroy();
});

beforeEach(async () => {
  stubEnv();
  await resetData(ctx);
  await createCatalog(ctx.local);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('I1: каталог отдает пояс бизнеса', () => {
  it('I1: в settings пояс Asia/Yekaterinburg -> GET /catalog отдает timeZone Asia/Yekaterinburg', async () => {
    await ctx.local.updateGlobal({ slug: 'settings', data: { timeZone: BUSINESS_TIME_ZONE }, overrideAccess: true });

    const response = await getCatalog({ initData: initDataFor('telegram', CLIENT_ID), platform: 'telegram' });

    expect(response.status).toBe(200);
    expect(((await response.json()) as { timeZone?: string }).timeZone).toBe(BUSINESS_TIME_ZONE);
  });
});
