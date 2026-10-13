import type { Payload } from 'payload';
import type { Order } from '../payload-types';
import { loadSettings, parseId } from './booking';
import {
  MAX_ORDER_QTY,
  MINUTE_MS,
  OPEN_ORDER_STATUSES,
  ORDER_LOCK_NAMESPACE,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  PICKUP_DELAY_MIN,
  PICKUP_LABELS,
  PICKUP_OPTIONS,
  PLATFORM_LABELS,
} from './consts';
import { ensureGuest, findActiveStaff, findGuest, guestLabel, notifyGuest } from './guests';
import { orderReadyText, ownerNewOrderText } from './messages';
import { sendToOwner } from './messenger';
import { logSideEffects } from './notify';
import { formatLocalTime } from './slots';
import { withLock } from './transaction';
import type { MiniAppAuth, OrderLineInput, OrderStatus, Pickup, ServiceResult } from './types';

const isPickup = (value: unknown): value is Pickup => PICKUP_OPTIONS.some((option) => option === value);

const isOrderStatus = (value: unknown): value is OrderStatus => ORDER_STATUSES.some((status) => status === value);

const isQty = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_ORDER_QTY;

/** Тело предзаказа: непустые позиции без повторов, количество 1..20, известное время выдачи; цена из тела не берется. */
const parseOrderInput = (body: unknown): { lines: OrderLineInput[]; pickup: Pickup } | null => {
  if (typeof body !== 'object' || body === null) {
    return null;
  }

  const { items, pickup } = body as { items?: unknown; pickup?: unknown };

  if (!Array.isArray(items) || items.length === 0 || !isPickup(pickup)) {
    return null;
  }

  const lines: OrderLineInput[] = [];

  for (const item of items) {
    const id = parseId((item as { id?: unknown } | null)?.id);
    const qty = (item as { qty?: unknown } | null)?.qty;

    if (id === null || !isQty(qty) || lines.some((line) => line.id === id)) {
      return null;
    }

    lines.push({ id, qty });
  }

  return { lines, pickup };
};

const pickupText = (pickup: Pickup, pickupAt: Date | null, timeZone: string): string => {
  const label = PICKUP_LABELS[pickup].toLowerCase();

  return pickupAt ? `${label}, к ${formatLocalTime(pickupAt, timeZone)}` : label;
};

const linesOut = (order: Order) => order.items.map(({ name, qty }) => ({ name, qty }));

type OrderCreated = { id: number; status: 'new'; total: number };

export const createOrder = async (
  payload: Payload,
  auth: MiniAppAuth,
  body: unknown,
  now: Date,
): Promise<ServiceResult<OrderCreated>> => {
  const input = parseOrderInput(body);

  if (!input) {
    return { status: 400 };
  }

  const { docs: menuItems } = await payload.find({
    collection: 'menu-items',
    where: { and: [{ id: { in: input.lines.map(({ id }) => id) } }, { available: { equals: true } }] },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });

  if (menuItems.length !== input.lines.length) {
    return { status: 409 };
  }

  const client = await ensureGuest(payload, auth, now);
  const lines = input.lines.map(({ id, qty }) => {
    const item = menuItems.find((menuItem) => menuItem.id === id)!;

    return { menuItem: item.id, name: item.name, price: item.price, qty };
  });
  const total = lines.reduce((sum, { price, qty }) => sum + price * qty, 0);
  const delayMin = PICKUP_DELAY_MIN[input.pickup];
  const pickupAt = delayMin === null ? null : new Date(now.getTime() + delayMin * MINUTE_MS);

  const order = await payload.create({
    collection: 'orders',
    data: {
      client: client.id,
      platform: auth.platform,
      items: lines,
      total,
      pickup: input.pickup,
      pickupAt: pickupAt?.toISOString() ?? null,
      status: 'new',
    },
    overrideAccess: true,
  });

  const { timeZone } = await loadSettings(payload);

  logSideEffects(
    payload,
    await Promise.allSettled([
      sendToOwner(
        ownerNewOrderText({
          id: order.id,
          lines,
          total,
          pickupLabel: pickupText(input.pickup, pickupAt, timeZone),
          clientLabel: guestLabel(client),
          platformLabel: PLATFORM_LABELS[auth.platform],
        }),
      ),
    ]),
    ['владельцу: предзаказ'],
  );

  return { status: 201, body: { id: order.id, status: 'new', total } };
};

export const guestOrders = async (payload: Payload, auth: MiniAppAuth) => {
  const client = await findGuest(payload, auth);

  if (!client) {
    return { orders: [] };
  }

  const { docs } = await payload.find({
    collection: 'orders',
    where: { client: { equals: client.id } },
    sort: '-createdAt',
    depth: 0,
    limit: 20,
    overrideAccess: true,
  });

  return {
    orders: docs.map((order) => ({ id: order.id, status: order.status, total: order.total, items: linesOut(order) })),
  };
};

type StaffOrder = {
  id: number;
  status: OrderStatus;
  total: number;
  pickup: Pickup;
  pickupAt: string | null;
  guest: { name: string };
  items: { name: string; qty: number }[];
};

/**
 * Открытые заказы для кассира, старые первыми: выданные и отмененные уходят из списка.
 * `timeZone` — пояс бизнеса: время выдачи кассир видит так же, как владелец в сообщении.
 */
export const staffOrders = async (
  payload: Payload,
  auth: MiniAppAuth,
): Promise<ServiceResult<{ orders: StaffOrder[]; timeZone: string }>> => {
  if (!(await findActiveStaff(payload, auth))) {
    return { status: 403 };
  }

  const [{ docs }, { timeZone }] = await Promise.all([
    payload.find({
      collection: 'orders',
      where: { status: { in: [...OPEN_ORDER_STATUSES] } },
      sort: 'createdAt',
      depth: 1,
      pagination: false,
      overrideAccess: true,
    }),
    loadSettings(payload),
  ]);

  return {
    status: 200,
    body: {
      orders: docs.map((order) => ({
        id: order.id,
        status: order.status,
        total: order.total,
        pickup: order.pickup,
        pickupAt: order.pickupAt ?? null,
        guest: { name: typeof order.client === 'object' ? guestLabel(order.client) : '' },
        items: linesOut(order),
      })),
      timeZone,
    },
  };
};

/** Кассир ведет заказ по графу статусов; на «готов» гостю пишет бот его платформы. */
export const setOrderStatus = async (
  payload: Payload,
  auth: MiniAppAuth,
  rawId: unknown,
  nextStatus: unknown,
): Promise<ServiceResult<{ id: number; status: OrderStatus }>> => {
  if (!(await findActiveStaff(payload, auth))) {
    return { status: 403 };
  }

  const id = parseId(rawId);
  const { docs } =
    id === null
      ? { docs: [] }
      : await payload.find({
          collection: 'orders',
          where: { id: { equals: id } },
          limit: 1,
          depth: 1,
          overrideAccess: true,
        });

  if (id === null || docs.length === 0) {
    return { status: 404 };
  }

  if (!isOrderStatus(nextStatus)) {
    return { status: 409 };
  }

  const changed = await withLock(payload, ORDER_LOCK_NAMESPACE, id, async (req) => {
    const fresh = await payload.findByID({ collection: 'orders', id, depth: 0, overrideAccess: true, req });
    const allowed: readonly OrderStatus[] = ORDER_TRANSITIONS[fresh.status];

    if (!allowed.includes(nextStatus)) {
      return false;
    }

    await payload.update({ collection: 'orders', id, data: { status: nextStatus }, overrideAccess: true, req });

    return true;
  });

  if (!changed) {
    return { status: 409 };
  }

  const client = docs[0]!.client;

  if (nextStatus === 'ready' && typeof client === 'object') {
    await notifyGuest(payload, client, orderReadyText(id), 'гостю: заказ готов');
  }

  return { status: 200, body: { id, status: nextStatus } };
};

export const menuItems = async (payload: Payload) => {
  const { docs } = await payload.find({
    collection: 'menu-items',
    where: { available: { equals: true } },
    sort: 'name',
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });

  return {
    items: docs.map(({ id, name, description, price, category }) => ({
      id,
      name,
      description: description ?? '',
      price,
      category,
    })),
  };
};
