import { TG_BASE, createAdmin, mockFetch, type Doc, type FetchCall, type Platform, type TestPayload } from './fixtures';

export const HOUR = 3_600_000;

type AdminUser = Record<string, unknown>;

/** Local API с правами залогиненного админа: хуки записи видят req.user, как при правке из админки. */
type AdminLocal = {
  create(args: {
    collection: string;
    data: Record<string, unknown>;
    user: AdminUser;
    overrideAccess: false;
  }): Promise<Doc>;
  update(args: {
    collection: string;
    id: number | string;
    data: Record<string, unknown>;
    user: AdminUser;
    overrideAccess: false;
  }): Promise<Doc>;
};

export type AdminApi = {
  createBooking(data: Record<string, unknown>): Promise<Doc>;
  updateBooking(id: number | string, data: Record<string, unknown>): Promise<Doc>;
};

export const createAdminApi = async ({ payload, local }: TestPayload): Promise<AdminApi> => {
  const admin = await createAdmin(local);
  const user: AdminUser = { ...admin, collection: 'users' };
  const api = payload as unknown as AdminLocal;

  return {
    createBooking: (data) => api.create({ collection: 'bookings', data, user, overrideAccess: false }),
    updateBooking: (id, data) => api.update({ collection: 'bookings', id, data, user, overrideAccess: false }),
  };
};

export const createClient = (
  { local }: TestPayload,
  who: { platform: Platform; userId: number; name?: string },
): Promise<Doc> =>
  local.create({
    collection: 'clients',
    data: { name: who.name ?? `Клиент${who.userId}`, platform: who.platform, platformUserId: String(who.userId) },
    overrideAccess: true,
  });

export const findBooking = ({ local }: TestPayload, id: number | string): Promise<Doc> =>
  local.findByID({ collection: 'bookings', id, depth: 0, overrideAccess: true });

export type ReminderRow = { kind: unknown; status: unknown; sendAt: string; attempts?: unknown };

/** Напоминания записи по возрастанию sendAt (и виду при равенстве). */
export const reminderRows = async ({ local }: TestPayload, bookingId: number | string): Promise<ReminderRow[]> => {
  const { docs } = await local.find({
    collection: 'reminders',
    where: { booking: { equals: bookingId } },
    depth: 0,
    limit: 20,
    overrideAccess: true,
  });

  return docs
    .map((doc) => ({
      kind: doc.kind,
      status: doc.status,
      sendAt: new Date(String(doc.sendAt)).toISOString(),
      attempts: doc.attempts,
    }))
    .sort((a, b) => a.sendAt.localeCompare(b.sendAt) || String(a.kind).localeCompare(String(b.kind)));
};

export const iso = (ms: number): string => new Date(ms).toISOString();

export const bodyText = (call: FetchCall): string => String((call.body as { text?: unknown }).text);

export const bodyChatId = (call: FetchCall): string => String((call.body as { chat_id?: unknown }).chat_id);

/** Тело вебхука CRM: id приводятся к строкам, как в crm-webhook.test.ts. */
export const crmBody = (call: FetchCall) => call.body as { event: string; startAt: string; endAt: string };

/**
 * Бот Telegram отвечает 500, пока `down` истинно; вызовы все равно попадают в журнал мока.
 * Вызывать после mockFetch().
 */
export const botOutage = (spy: ReturnType<typeof mockFetch>['spy']) => {
  const original = spy.getMockImplementation();

  if (!original) {
    throw new Error('mockFetch() должен быть вызван раньше');
  }

  const state = { down: false };

  spy.mockImplementation(async (input, init) => {
    const response = await original(input, init);
    const url = String(input instanceof URL ? input.href : input instanceof Request ? input.url : input);

    return state.down && url.startsWith(TG_BASE) ? new Response('bot down', { status: 500 }) : response;
  });

  return state;
};
