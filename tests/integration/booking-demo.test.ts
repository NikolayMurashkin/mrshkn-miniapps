import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCatalog,
  getCatalog,
  initDataFor,
  initPayload,
  MASTER_NAME,
  resetData,
  SERVICE_NAME,
  stubEnv,
  type Platform,
  type TestPayload,
} from './fixtures';

const CLIENT_ID = 7101;
/** Пояс из засева каталога (`createCatalog`). */
const CATALOG_TIME_ZONE = 'Europe/Kaliningrad';

type CatalogBody = {
  services?: { id: unknown; name: string; durationMin: number }[];
  masters?: { id: unknown; name: string; services: unknown[] }[];
  timeZone?: string;
  demo?: unknown;
} & Record<string, unknown>;

let ctx: TestPayload;

const catalogOf = async (platform: Platform = 'telegram'): Promise<CatalogBody> => {
  const response = await getCatalog({ initData: initDataFor(platform, CLIENT_ID), platform });

  expect(response.status).toBe(200);

  return (await response.json()) as CatalogBody;
};

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

describe('флаг демо-экземпляра в ответе каталога записи', () => {
  it('DEMO_INSTANCE=true, initData Telegram: 200, demo === true, услуги, мастера и пояс на месте', async () => {
    vi.stubEnv('DEMO_INSTANCE', 'true');

    const body = await catalogOf('telegram');

    expect(body.demo).toBe(true);
    expect(body.timeZone).toBe(CATALOG_TIME_ZONE);
    expect(body.services?.map(({ name }) => name)).toEqual([SERVICE_NAME]);
    expect(body.masters?.map(({ name }) => name)).toEqual([MASTER_NAME]);
  });

  it.each<[string, string | undefined]>([
    ['не задана', undefined],
    ['пустая строка', ''],
    ['false', 'false'],
    ['1', '1'],
    ['TRUE', 'TRUE'],
  ])('DEMO_INSTANCE %s: 200, поле demo есть и строго false', async (_label, value) => {
    vi.stubEnv('DEMO_INSTANCE', value);

    const body = await catalogOf('telegram');

    expect(body.services?.map(({ name }) => name)).toEqual([SERVICE_NAME]);
    expect(body).toHaveProperty('demo');
    expect(body.demo).toBe(false);
  });

  it('флаг читается на каждом запросе: true, затем снят — второй ответ demo === false', async () => {
    vi.stubEnv('DEMO_INSTANCE', 'true');
    expect((await catalogOf('telegram')).demo).toBe(true);

    vi.stubEnv('DEMO_INSTANCE', undefined);

    const second = await catalogOf('telegram');

    expect(second).toHaveProperty('demo');
    expect(second.demo).toBe(false);
  });

  it('DEMO_INSTANCE=true, initData MAX: 200, demo === true', async () => {
    vi.stubEnv('DEMO_INSTANCE', 'true');

    const body = await catalogOf('max');

    expect(body.demo).toBe(true);
    expect(body.services?.map(({ name }) => name)).toEqual([SERVICE_NAME]);
  });

  it('DEMO_INSTANCE=true без initData: 401, в теле нет demo и каталога', async () => {
    vi.stubEnv('DEMO_INSTANCE', 'true');

    const response = await getCatalog({ initData: null, platform: 'telegram' });

    expect(response.status).toBe(401);

    const body = (await response.json()) as CatalogBody;

    expect(body).not.toHaveProperty('demo');
    expect(body).not.toHaveProperty('services');
    expect(body).not.toHaveProperty('masters');
  });
});
