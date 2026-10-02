import config from '@payload-config';
import { getPayload, type Payload } from 'payload';
import { vi } from 'vitest';
import { POST as cancelPost } from '@/app/api/miniapp/bookings/[id]/cancel/route';
import { POST as bookingsPost } from '@/app/api/miniapp/bookings/route';
import { GET as catalogGet } from '@/app/api/miniapp/catalog/route';
import { GET as slotsGet } from '@/app/api/miniapp/slots/route';
import { buildInitData } from '../helpers/sign-init-data';

export const TELEGRAM_TOKEN = '123456:TG-integration-token';
export const MAX_TOKEN = 'max-integration-token';
export const OWNER_CHAT_ID = '777000';
export const TG_BASE = 'https://tg.test';
export const MAX_BASE = 'https://max.test';
export const CRM_URL = 'https://crm.test/hook';

/** День записи далеко в будущем: Date.now() реальный, часы не подменяются. 10:00 Калининграда = 08:00Z. */
export const BOOKING_DATE = '2030-03-12';
export const slotIso = (hhmmLocal: string): string => new Date(`${BOOKING_DATE}T${hhmmLocal}:00+02:00`).toISOString();

export type Platform = 'telegram' | 'max';
export type Doc = { id: number | string } & Record<string, unknown>;

/** Local API без привязки к сгенерированным типам: коллекции появятся вместе с реализацией. */
export type LooseLocal = {
  create(args: { collection: string; data: Record<string, unknown>; overrideAccess?: boolean }): Promise<Doc>;
  update(args: {
    collection: string;
    id: number | string;
    data: Record<string, unknown>;
    overrideAccess?: boolean;
  }): Promise<Doc>;
  findByID(args: { collection: string; id: number | string; depth?: number; overrideAccess?: boolean }): Promise<Doc>;
  find(args: {
    collection: string;
    where?: Record<string, unknown>;
    depth?: number;
    limit?: number;
    user?: Record<string, unknown>;
    overrideAccess?: boolean;
  }): Promise<{ docs: Doc[]; totalDocs: number }>;
  delete(args: { collection: string; where: Record<string, unknown>; overrideAccess?: boolean }): Promise<unknown>;
  updateGlobal(args: { slug: string; data: Record<string, unknown>; overrideAccess?: boolean }): Promise<unknown>;
};

export type TestPayload = { payload: Payload; local: LooseLocal };

export const initPayload = async (): Promise<TestPayload> => {
  const payload = await getPayload({ config });

  return { payload, local: payload as unknown as LooseLocal };
};

export const relId = (value: unknown): string =>
  String(typeof value === 'object' && value !== null ? (value as { id: unknown }).id : value);

/** Переменные окружения контракта плана; crmUrl '' - вебхук выключен. */
export const stubEnv = (crmUrl: string = CRM_URL): void => {
  vi.stubEnv('TELEGRAM_BOT_TOKEN', TELEGRAM_TOKEN);
  vi.stubEnv('MAX_BOT_TOKEN', MAX_TOKEN);
  vi.stubEnv('OWNER_TELEGRAM_CHAT_ID', OWNER_CHAT_ID);
  vi.stubEnv('CRM_WEBHOOK_URL', crmUrl);
  vi.stubEnv('TELEGRAM_API_BASE', TG_BASE);
  vi.stubEnv('MAX_API_BASE', MAX_BASE);
};

export const resetData = async ({ local }: TestPayload): Promise<void> => {
  for (const collection of ['reminders', 'bookings', 'clients', 'masters', 'services', 'users']) {
    await local.delete({ collection, where: { id: { exists: true } }, overrideAccess: true });
  }
};

export const createAdmin = (local: LooseLocal): Promise<Doc> =>
  local.create({
    collection: 'users',
    data: { email: 'admin@salon.example.test', password: 'Passw0rd-test' },
    overrideAccess: true,
  });

/** Расписание 10:00-18:00 со всеми днями недели 0-6 (0 - воскресенье, как Date.getDay) и перерывом 13:00-14:00. */
const defaultSchedule = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  start: '10:00',
  end: '18:00',
  breaks: [{ start: '13:00', end: '14:00' }],
}));

export const createMaster = (
  local: LooseLocal,
  input: { name: string; serviceIds: (number | string)[] },
): Promise<Doc> =>
  local.create({
    collection: 'masters',
    data: { name: input.name, services: input.serviceIds, schedule: defaultSchedule },
    overrideAccess: true,
  });

export type Catalog = { service: Doc; master: Doc };

export const SERVICE_NAME = 'Стрижка женская';
export const MASTER_NAME = 'Мария Волкова';

export const createCatalog = async (local: LooseLocal): Promise<Catalog> => {
  await local.updateGlobal({
    slug: 'settings',
    data: { timeZone: 'Europe/Kaliningrad', slotStepMin: 30 },
    overrideAccess: true,
  });

  const service = await local.create({
    collection: 'services',
    data: { name: SERVICE_NAME, durationMin: 60 },
    overrideAccess: true,
  });
  const master = await createMaster(local, { name: MASTER_NAME, serviceIds: [service.id] });

  return { service, master };
};

export type FetchCall = { url: string; method: string; headers: Headers; body: unknown };

const parseBody = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/** Мок globalThis.fetch: фиксирует вызовы; ответы CRM настраиваются, остальным 200. */
export const mockFetch = () => {
  const calls: FetchCall[] = [];
  let crmHandler: () => Response | Promise<Response> = () => new Response('{}', { status: 200 });

  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = request ? request.url : String(input instanceof URL ? input.href : input);
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers ?? request?.headers);
    const rawBody =
      init?.body !== undefined && init?.body !== null ? String(init.body) : request ? await request.clone().text() : '';

    calls.push({ url, method, headers, body: rawBody ? parseBody(rawBody) : undefined });

    return url === CRM_URL ? crmHandler() : new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  });

  return {
    spy,
    calls,
    crmCalls: () => calls.filter((call) => call.url === CRM_URL),
    telegramCalls: () => calls.filter((call) => call.url === `${TG_BASE}/bot${TELEGRAM_TOKEN}/sendMessage`),
    maxCalls: () => calls.filter((call) => call.url.startsWith(`${MAX_BASE}/messages`)),
    clear: () => {
      calls.length = 0;
    },
    setCrm: (handler: () => Response | Promise<Response>) => {
      crmHandler = handler;
    },
  };
};

/**
 * Ждет, пока журнал вызовов перестанет расти: уведомления и вебхук могут уходить после ответа обработчика,
 * и без ожидания опоздавший вызов прошлой записи попал бы в журнал после clear().
 */
export const waitForQuiet = async (calls: FetchCall[], quietMs = 200, timeoutMs = 10_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  let seen = -1;

  while (Date.now() < deadline) {
    if (calls.length === seen) {
      return;
    }

    seen = calls.length;
    await new Promise((resolve) => setTimeout(resolve, quietMs));
  }

  throw new Error('побочные вызовы fetch не утихли');
};

export const tokenOf = (platform: Platform): string => (platform === 'telegram' ? TELEGRAM_TOKEN : MAX_TOKEN);

/** Свежая валидная initData платформы для пользователя с данным id. */
export const initDataFor = (platform: Platform, userId: number, authDate: Date = new Date()): string =>
  buildInitData({
    botToken: tokenOf(platform),
    user: { id: userId, first_name: `Клиент${userId}`, username: `client_${userId}` },
    authDate,
  });

export type ApiInit = {
  method?: 'GET' | 'POST';
  initData?: string | null;
  platform?: string | null;
  body?: unknown;
};

export const apiRequest = (path: string, init: ApiInit = {}): Request => {
  const headers = new Headers();

  if (init.initData != null) {
    headers.set('Authorization', `tma ${init.initData}`);
  }

  if (init.platform != null) {
    headers.set('X-Mini-App-Platform', init.platform);
  }

  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  return new Request(`http://localhost/api/miniapp/${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
};

export const postBooking = (
  catalog: Catalog,
  startAt: string,
  who: { platform: Platform; userId: number },
): Promise<Response> =>
  bookingsPost(
    apiRequest('bookings', {
      method: 'POST',
      platform: who.platform,
      initData: initDataFor(who.platform, who.userId),
      body: { serviceId: catalog.service.id, masterId: catalog.master.id, startAt },
    }),
  );

export const postCancel = (id: number | string, who: { platform: Platform; userId: number }): Promise<Response> =>
  cancelPost(
    apiRequest(`bookings/${id}/cancel`, {
      method: 'POST',
      platform: who.platform,
      initData: initDataFor(who.platform, who.userId),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );

export const getSlots = async (catalog: Catalog, who: { platform: Platform; userId: number }): Promise<number[]> => {
  const response = await slotsGet(
    apiRequest(`slots?serviceId=${catalog.service.id}&masterId=${catalog.master.id}&date=${BOOKING_DATE}`, {
      platform: who.platform,
      initData: initDataFor(who.platform, who.userId),
    }),
  );
  const { slots } = (await response.json()) as { slots: string[] };

  return slots.map((slot) => new Date(slot).getTime());
};

export const getCatalog = (init: ApiInit): Promise<Response> => catalogGet(apiRequest('catalog', init));

/** Создает запись через API и возвращает ее id; 201 обязателен. */
export const createBookingVia = async (
  catalog: Catalog,
  startAt: string,
  who: { platform: Platform; userId: number },
): Promise<number | string> => {
  const response = await postBooking(catalog, startAt, who);

  if (response.status !== 201) {
    throw new Error(`ожидался 201 при создании записи, получен ${response.status}`);
  }

  return ((await response.json()) as { id: number | string }).id;
};

export const findBookings = async ({ local }: TestPayload): Promise<Doc[]> =>
  (await local.find({ collection: 'bookings', depth: 0, limit: 100, overrideAccess: true })).docs;
