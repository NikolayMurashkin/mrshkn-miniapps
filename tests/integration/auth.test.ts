import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as cancelPost } from '@/app/api/miniapp/bookings/[id]/cancel/route';
import { POST as bookingsPost } from '@/app/api/miniapp/bookings/route';
import { GET as catalogGet } from '@/app/api/miniapp/catalog/route';
import { GET as slotsGet } from '@/app/api/miniapp/slots/route';
import { tamperInitData } from '../helpers/sign-init-data';
import {
  BOOKING_DATE,
  apiRequest,
  createBookingVia,
  createCatalog,
  findBookings,
  initDataFor,
  initPayload,
  mockFetch,
  resetData,
  slotIso,
  stubEnv,
  waitForQuiet,
  type Catalog,
  type TestPayload,
} from './fixtures';

const OWNER_OF_BOOKING = { platform: 'telegram', userId: 4242 } as const;
const CLIENT_ID = 4343;

type AuthCase = {
  n: string;
  title: string;
  headers: (valid: string) => { initData: string | null; platform: string | null };
};

const staleAuthDate = new Date(Date.now() - 25 * 3_600_000);

const cases: AuthCase[] = [
  { n: '6.1', title: 'без Authorization', headers: () => ({ initData: null, platform: 'telegram' }) },
  {
    n: '6.2',
    title: 'испорченная подпись',
    headers: (valid) => ({ initData: tamperInitData(valid, 'user', JSON.stringify({ id: 1 })), platform: 'telegram' }),
  },
  {
    n: '6.3',
    title: 'просроченная auth_date',
    headers: () => ({ initData: initDataFor('telegram', CLIENT_ID, staleAuthDate), platform: 'telegram' }),
  },
  {
    n: '6.4',
    title: 'подпись Telegram при X-Mini-App-Platform: max',
    headers: (valid) => ({ initData: valid, platform: 'max' }),
  },
  { n: '6.5', title: 'неизвестная платформа', headers: (valid) => ({ initData: valid, platform: 'whatsapp' }) },
];

let ctx: TestPayload;
let catalog: Catalog;
let existingBookingId: number | string;
let fetchMock: ReturnType<typeof mockFetch>;

type HandlerCase = {
  name: string;
  call: (auth: { initData: string | null; platform: string | null }) => Promise<Response>;
  mutating: boolean;
};

const handlers: HandlerCase[] = [
  { name: 'catalog', mutating: false, call: (auth) => catalogGet(apiRequest('catalog', auth)) },
  {
    name: 'slots',
    mutating: false,
    call: (auth) =>
      slotsGet(
        apiRequest(`slots?serviceId=${catalog.service.id}&masterId=${catalog.master.id}&date=${BOOKING_DATE}`, auth),
      ),
  },
  {
    name: 'bookings',
    mutating: true,
    call: (auth) =>
      bookingsPost(
        apiRequest('bookings', {
          ...auth,
          method: 'POST',
          body: { serviceId: catalog.service.id, masterId: catalog.master.id, startAt: slotIso('12:00') },
        }),
      ),
  },
  {
    name: 'cancel',
    mutating: true,
    call: (auth) =>
      cancelPost(apiRequest(`bookings/${existingBookingId}/cancel`, { ...auth, method: 'POST' }), {
        params: Promise.resolve({ id: String(existingBookingId) }),
      }),
  },
];

beforeAll(async () => {
  ctx = await initPayload();
});

afterAll(async () => {
  await ctx.payload.destroy();
});

beforeEach(async () => {
  stubEnv();
  await resetData(ctx);
  catalog = await createCatalog(ctx.local);
  fetchMock = mockFetch();
  existingBookingId = await createBookingVia(catalog, slotIso('10:00'), OWNER_OF_BOOKING);
  await waitForQuiet(fetchMock.calls);
  fetchMock.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('401 без валидной initData', () => {
  for (const handler of handlers) {
    for (const authCase of cases) {
      it(`${authCase.n} ${handler.name}: ${authCase.title}: 401`, async () => {
        const valid = initDataFor('telegram', CLIENT_ID);
        const response = await handler.call(authCase.headers(valid));

        expect(response.status).toBe(401);

        if (handler.mutating) {
          const bookings = await findBookings(ctx);

          expect(bookings).toHaveLength(1);
          expect(String(bookings[0]!.id)).toBe(String(existingBookingId));
          expect(bookings[0]!.status).toBe('active');
          expect(fetchMock.calls).toEqual([]);
        }
      });
    }
  }
});
