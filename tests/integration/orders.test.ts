import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OWNER_CHAT_ID,
  callMiniApp,
  clientNameOf,
  createStaff,
  initPayload,
  messagesTo,
  mockFetch,
  requireCollections,
  resetData,
  stubEnv,
  waitForQuiet,
  type Doc,
  type TestPayload,
  type Who,
} from './fixtures';

const STAFF: Who = { platform: 'telegram', userId: 5001 };
const ANNA: Who = { platform: 'telegram', userId: 4242 };
const OLEG_MAX: Who = { platform: 'max', userId: 9001 };
const MINUTE_MS = 60_000;
const MISSING_ID = '999999';

type OrderLine = { name: string; qty: number };
type OrderCreated = { id: string | number; status: string; total: number };
type StaffOrder = {
  id: string | number;
  status: string;
  total: number;
  pickup: string;
  pickupAt: string | null;
  guest: { name: string };
  items: OrderLine[];
};
type GuestOrder = { id: string | number; status: string; total: number; items: OrderLine[] };
type MenuItemOut = { id: string | number; name: string; description: string; price: number; category: string };

let ctx: TestPayload;
let fetchMock: ReturnType<typeof mockFetch>;
let cappuccino: Doc;
let croissant: Doc;
let syrniki: Doc;

const readJson = async <T>(response: Response, status: number): Promise<T> => {
  expect(response.status).toBe(status);

  return (await response.json()) as T;
};

/** Гость открыл Mini App: GET /loyalty/me, как это делает фронт первым запросом. */
const enter = async (who: Who) => readJson(await callMiniApp('loyalty/me', 'GET', { who }), 200);

const standardOrder = (pickup = 'asap') => ({
  items: [
    { id: cappuccino.id, qty: 2 },
    { id: croissant.id, qty: 1 },
  ],
  pickup,
});

const postOrder = (who: Who, body: unknown) => callMiniApp('orders', 'POST', { who, body });
const createOrder = async (who: Who, body: unknown = standardOrder()): Promise<OrderCreated> =>
  readJson<OrderCreated>(await postOrder(who, body), 201);

const staffOrders = async (): Promise<StaffOrder[]> =>
  (await readJson<{ orders: StaffOrder[] }>(await callMiniApp('staff/orders', 'GET', { who: STAFF }), 200)).orders;

const guestOrders = async (who: Who): Promise<GuestOrder[]> =>
  (await readJson<{ orders: GuestOrder[] }>(await callMiniApp('orders', 'GET', { who }), 200)).orders;

const setStatus = (id: string | number, status: string, by: Who = STAFF) =>
  callMiniApp('staff/orders/[id]/status', 'POST', { who: by, body: { status }, params: { id: String(id) } });

const orderDoc = (id: string | number) =>
  ctx.local.findByID({ collection: 'orders', id, depth: 0, overrideAccess: true });

const countOrders = async () =>
  (await ctx.local.find({ collection: 'orders', limit: 1, depth: 0, overrideAccess: true })).totalDocs;

const ownerMessages = () =>
  fetchMock
    .telegramCalls()
    .filter((call) => String((call.body as { chat_id?: unknown }).chat_id) === OWNER_CHAT_ID)
    .map((call) => String((call.body as { text?: unknown }).text ?? ''));

const linesOf = (items: OrderLine[]) =>
  items.map(({ name, qty }) => ({ name, qty })).sort((a, b) => a.name.localeCompare(b.name));

const sameId = (a: unknown, b: unknown) => String(a) === String(b);

/** Номер заказа в тексте отдельным числом, а не частью другого. */
const mentionsNumber = (text: string, id: string | number) => new RegExp(`(^|\\D)${id}(\\D|$)`).test(text);

/** Сбрасывает журнал после побочных вызовов, чтобы следующий шаг проверялся с чистого листа. */
const settle = async () => {
  await waitForQuiet(fetchMock.calls);
  fetchMock.clear();
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
  fetchMock = mockFetch();
  requireCollections(ctx, ['staff', 'menu-items', 'orders']);
  await createStaff(ctx.local, { ...STAFF, name: 'Вера' });

  const createItem = (data: Record<string, unknown>) =>
    ctx.local.create({ collection: 'menu-items', data, overrideAccess: true });

  cappuccino = await createItem({ name: 'Капучино', description: '250 мл', price: 260, category: 'coffee' });
  croissant = await createItem({ name: 'Круассан', description: 'на сливочном масле', price: 190, category: 'bakery' });
  syrniki = await createItem({
    name: 'Сырники со сметаной',
    description: 'три сырника',
    price: 390,
    category: 'breakfast',
    available: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('предзаказ из меню: виден персоналу со статусом', () => {
  it('O1 гость заказал 2 капучино и круассан «как можно скорее»: 201 new 710, заказ у кассира, сообщение владельцу', async () => {
    await enter(ANNA);

    const created = await createOrder(ANNA);

    expect(created).toMatchObject({ status: 'new', total: 710 });

    const listed = (await staffOrders()).find((order) => sameId(order.id, created.id));

    expect(listed).toMatchObject({ status: 'new', total: 710, guest: { name: clientNameOf(ANNA.userId) } });
    expect(linesOf(listed!.items)).toEqual([
      { name: 'Капучино', qty: 2 },
      { name: 'Круассан', qty: 1 },
    ]);

    await vi.waitFor(() => expect(ownerMessages()).toHaveLength(1));
    await waitForQuiet(fetchMock.calls);

    const [text] = ownerMessages();

    expect(ownerMessages()).toHaveLength(1);
    expect(text).toContain('Капучино');
    expect(text).toContain('Круассан');
    expect(text).toContain('710');
    expect(text!.toLowerCase()).toContain('как можно скорее');
  });

  it('O2 цена из тела не принимается; смена цены в админке после заказа не меняет price и total заказа', async () => {
    await enter(ANNA);

    const created = await createOrder(ANNA, {
      items: [
        { id: cappuccino.id, qty: 2, price: 1 },
        { id: croissant.id, qty: 1, price: 1 },
      ],
      pickup: 'asap',
    });

    expect(created.total).toBe(710);

    await ctx.local.update({ collection: 'menu-items', id: cappuccino.id, data: { price: 300 }, overrideAccess: true });

    const doc = await orderDoc(created.id);
    const lines = doc.items as { name: string; price: number; qty: number }[];

    expect(doc.total).toBe(710);
    expect(lines.find((line) => line.name === 'Капучино')?.price).toBe(260);
    expect((await guestOrders(ANNA)).find((order) => sameId(order.id, created.id))?.total).toBe(710);
  });

  it('O3 pickup in15: pickupAt = создание + 15 мин (± 1 мин); asap: pickupAt пуст', async () => {
    await enter(ANNA);

    const before = Date.now();
    const soon = await createOrder(ANNA, standardOrder('in15'));
    const after = Date.now();
    const pickupAt = new Date(String((await orderDoc(soon.id)).pickupAt)).getTime();

    expect(pickupAt).toBeGreaterThanOrEqual(before + 15 * MINUTE_MS - MINUTE_MS);
    expect(pickupAt).toBeLessThanOrEqual(after + 15 * MINUTE_MS + MINUTE_MS);

    const asap = await createOrder(ANNA, standardOrder('asap'));

    expect((await orderDoc(asap.id)).pickupAt ?? null).toBeNull();
  });

  it('O4 неверное тело — 400, позиция снята с меню или ее нет — 409; заказа нет, владельцу ничего', async () => {
    await enter(ANNA);

    const invalid: [string, unknown][] = [
      ['пустой items', { items: [], pickup: 'asap' }],
      ['qty 0', { items: [{ id: cappuccino.id, qty: 0 }], pickup: 'asap' }],
      ['qty 21', { items: [{ id: cappuccino.id, qty: 21 }], pickup: 'asap' }],
      ['pickup tomorrow', { items: [{ id: cappuccino.id, qty: 1 }], pickup: 'tomorrow' }],
      [
        'повтор позиции',
        {
          items: [
            { id: cappuccino.id, qty: 1 },
            { id: cappuccino.id, qty: 2 },
          ],
          pickup: 'asap',
        },
      ],
    ];

    for (const [label, body] of invalid) {
      expect((await postOrder(ANNA, body)).status, label).toBe(400);
    }

    expect((await callMiniApp('orders', 'POST', { who: ANNA, rawBody: '{"items": [' })).status, 'тело не JSON').toBe(
      400,
    );

    expect(
      (await postOrder(ANNA, { items: [{ id: syrniki.id, qty: 1 }], pickup: 'asap' })).status,
      'available: false',
    ).toBe(409);
    expect(
      (await postOrder(ANNA, { items: [{ id: MISSING_ID, qty: 1 }], pickup: 'asap' })).status,
      'несуществующий id',
    ).toBe(409);

    expect(await countOrders()).toBe(0);

    await waitForQuiet(fetchMock.calls);

    expect(ownerMessages()).toEqual([]);
  });

  it('O5 new → preparing → ready: 200, на ready гостю одно сообщение «готов» с номером; ready → done — заказ пропал у кассира', async () => {
    await enter(ANNA);

    const created = await createOrder(ANNA);

    await settle();

    expect((await setStatus(created.id, 'preparing')).status).toBe(200);
    expect((await setStatus(created.id, 'ready')).status).toBe(200);

    await vi.waitFor(() => expect(messagesTo(fetchMock.calls, ANNA)).toHaveLength(1));
    await waitForQuiet(fetchMock.calls);

    const toGuest = messagesTo(fetchMock.calls, ANNA);

    expect(toGuest).toHaveLength(1);
    expect(toGuest[0]!.toLowerCase()).toContain('готов');
    expect(mentionsNumber(toGuest[0]!, created.id), toGuest[0]).toBe(true);
    expect((await guestOrders(ANNA)).find((order) => sameId(order.id, created.id))?.status).toBe('ready');

    expect((await setStatus(created.id, 'done')).status).toBe(200);
    expect((await staffOrders()).map((order) => String(order.id))).not.toContain(String(created.id));
  });

  it('O6 переход не по графу — 409, статус прежний, гостю ничего; new → cancelled — 200; нет заказа — 404; гость — 403', async () => {
    await enter(ANNA);

    const fresh = await createOrder(ANNA);

    await settle();

    expect((await setStatus(fresh.id, 'ready')).status, 'new → ready').toBe(409);
    expect((await setStatus(fresh.id, 'eaten')).status, 'неизвестный статус').toBe(409);
    expect((await setStatus(fresh.id, 'preparing', ANNA)).status, 'гость меняет статус').toBe(403);
    expect((await callMiniApp('staff/orders', 'GET', { who: ANNA })).status, 'гость читает заказы кассира').toBe(403);
    expect((await orderDoc(fresh.id)).status).toBe('new');
    expect((await setStatus(MISSING_ID, 'preparing')).status, 'нет заказа').toBe(404);

    await waitForQuiet(fetchMock.calls);

    expect(messagesTo(fetchMock.calls, ANNA)).toEqual([]);
    expect((await setStatus(fresh.id, 'cancelled')).status, 'new → cancelled').toBe(200);
    expect((await orderDoc(fresh.id)).status).toBe('cancelled');
    expect(
      (await staffOrders()).map((order) => String(order.id)),
      'отмененный заказ у кассира',
    ).not.toContain(String(fresh.id));

    const served = await createOrder(ANNA);

    expect((await setStatus(served.id, 'preparing')).status).toBe(200);
    expect((await setStatus(served.id, 'ready')).status).toBe(200);
    await settle();

    expect((await setStatus(served.id, 'cancelled')).status, 'ready → cancelled').toBe(409);
    expect((await orderDoc(served.id)).status).toBe('ready');

    await waitForQuiet(fetchMock.calls);

    expect(messagesTo(fetchMock.calls, ANNA)).toEqual([]);
    expect((await setStatus(served.id, 'done')).status).toBe(200);
    await settle();

    expect((await setStatus(served.id, 'preparing')).status, 'done → preparing').toBe(409);
    expect((await orderDoc(served.id)).status).toBe('done');

    await waitForQuiet(fetchMock.calls);

    expect(messagesTo(fetchMock.calls, ANNA)).toEqual([]);
  });

  it('O7 GET /menu — только доступные позиции с полями id, name, description, price, category; гость не видит чужих заказов', async () => {
    await enter(ANNA);

    const menu = await readJson<{ items: MenuItemOut[] }>(await callMiniApp('menu', 'GET', { who: ANNA }), 200);

    expect(
      menu.items.map((item) => ({ ...item, id: String(item.id) })).sort((a, b) => a.name.localeCompare(b.name)),
    ).toEqual([
      { id: String(cappuccino.id), name: 'Капучино', description: '250 мл', price: 260, category: 'coffee' },
      {
        id: String(croissant.id),
        name: 'Круассан',
        description: 'на сливочном масле',
        price: 190,
        category: 'bakery',
      },
    ]);

    const created = await createOrder(ANNA);

    await enter(OLEG_MAX);

    expect(await guestOrders(OLEG_MAX)).toEqual([]);
    expect((await guestOrders(ANNA)).map((order) => String(order.id))).toEqual([String(created.id)]);
  });

  it('O8 Telegram отвечает 500 на сообщение владельцу: заказ все равно создан, 201', async () => {
    await enter(ANNA);
    fetchMock.setBot(() => new Response(JSON.stringify({ ok: false }), { status: 500 }));

    const created = await createOrder(ANNA);

    expect(created).toMatchObject({ status: 'new', total: 710 });
    // бот владельца действительно вызван и ответил ошибкой
    await vi.waitFor(() => expect(ownerMessages()).toHaveLength(1));
    expect(await countOrders()).toBe(1);
    expect((await orderDoc(created.id)).status).toBe('new');
  });

  it('O9 GET /staff/orders отдает timeZone бизнеса из settings: время выдачи кассир видит в поясе кофейни', async () => {
    const before = await ctx.payload.findGlobal({ slug: 'settings', depth: 0, overrideAccess: true });

    await ctx.payload.updateGlobal({ slug: 'settings', data: { timeZone: 'Asia/Vladivostok' }, overrideAccess: true });

    try {
      await enter(ANNA);
      await createOrder(ANNA, standardOrder('in15'));

      const body = await readJson<{ orders: StaffOrder[]; timeZone: string }>(
        await callMiniApp('staff/orders', 'GET', { who: STAFF }),
        200,
      );

      expect(body.timeZone).toBe('Asia/Vladivostok');
      expect(body.orders).toHaveLength(1);
    } finally {
      await ctx.payload.updateGlobal({
        slug: 'settings',
        data: { timeZone: before.timeZone ?? null },
        overrideAccess: true,
      });
    }
  });
});
