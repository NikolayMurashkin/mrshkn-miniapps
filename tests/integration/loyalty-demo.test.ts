import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  callMiniApp,
  createStaff,
  initPayload,
  mockFetch,
  requireCollections,
  resetData,
  stubEnv,
  type TestPayload,
  type Who,
} from './fixtures';

const GUEST: Who = { platform: 'telegram', userId: 6101 };
const STAFF: Who = { platform: 'telegram', userId: 6201 };
const STAFF_NAME = 'Вера';

type MeBody = { role: string; demo?: unknown } & Record<string, unknown>;

let ctx: TestPayload;

const meOf = async (who: Who): Promise<MeBody> => {
  const response = await callMiniApp('loyalty/me', 'GET', { who });

  expect(response.status).toBe(200);

  return (await response.json()) as MeBody;
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
  mockFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('флаг демо-экземпляра в ответе /loyalty/me', () => {
  it('P1 DEMO_INSTANCE=true, гость: 200, demo === true, поля карты гостя на месте', async () => {
    vi.stubEnv('DEMO_INSTANCE', 'true');

    const body = await meOf(GUEST);

    expect(body).toMatchObject({ role: 'guest', stamps: 0 });
    expect(body.demo).toBe(true);
  });

  it('P2 DEMO_INSTANCE=true, активный кассир: 200, role staff, demo === true', async () => {
    requireCollections(ctx, ['staff']);
    await createStaff(ctx.local, { ...STAFF, name: STAFF_NAME });
    vi.stubEnv('DEMO_INSTANCE', 'true');

    const body = await meOf(STAFF);

    expect(body.role).toBe('staff');
    expect(body.demo).toBe(true);
  });

  it.each<[string, string | undefined]>([
    ['не задана', undefined],
    ['пустая строка', ''],
    ['false', 'false'],
    ['1', '1'],
  ])('P3 DEMO_INSTANCE %s: demo строго false', async (_label, value) => {
    vi.stubEnv('DEMO_INSTANCE', value);

    const body = await meOf(GUEST);

    expect(body.role).toBe('guest');
    expect(body).toHaveProperty('demo');
    expect(body.demo).toBe(false);
  });

  it('P4 флаг читается на каждом запросе: true, затем снят — второй ответ demo === false', async () => {
    vi.stubEnv('DEMO_INSTANCE', 'true');
    expect((await meOf(GUEST)).demo).toBe(true);

    vi.stubEnv('DEMO_INSTANCE', undefined);

    const second = await meOf(GUEST);

    expect(second).toHaveProperty('demo');
    expect(second.demo).toBe(false);
  });
});
