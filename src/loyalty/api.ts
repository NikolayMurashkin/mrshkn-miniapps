import type { Bridge } from '@/bridge/types';
import { API_BASE } from './consts';
import type {
  ApiFailureKind,
  ApiResult,
  GuestOrder,
  HistoryEvent,
  Me,
  MenuItem,
  OrderStatus,
  Pickup,
  QrTicket,
  ScanResult,
  StaffOrders,
} from './types';

const FAILURES: Record<number, ApiFailureKind> = {
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not-found',
  409: 'conflict',
  410: 'gone',
};

const request = async <T>(bridge: Bridge, path: string, init: { method?: 'POST'; body?: unknown } = {}) => {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        Authorization: `tma ${bridge.initData}`,
        'X-Mini-App-Platform': bridge.platform,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return { kind: 'network' } as ApiResult<T>;
  }

  if (!response.ok) {
    return { kind: FAILURES[response.status] ?? 'failed' } as ApiResult<T>;
  }

  try {
    return { kind: 'ok', data: (await response.json()) as T } as ApiResult<T>;
  } catch {
    return { kind: 'failed' } as ApiResult<T>;
  }
};

export const fetchMe = (bridge: Bridge) => request<Me>(bridge, '/loyalty/me');

export const issueQr = (bridge: Bridge) => request<QrTicket>(bridge, '/loyalty/qr', { method: 'POST' });

export const fetchHistory = (bridge: Bridge) => request<{ events: HistoryEvent[] }>(bridge, '/loyalty/history');

export const fetchMenu = (bridge: Bridge) => request<{ items: MenuItem[] }>(bridge, '/menu');

export const fetchMyOrders = (bridge: Bridge) => request<{ orders: GuestOrder[] }>(bridge, '/orders');

export const createOrder = (bridge: Bridge, body: { items: { id: string; qty: number }[]; pickup: Pickup }) =>
  request<{ id: number; status: OrderStatus; total: number }>(bridge, '/orders', { method: 'POST', body });

export const scanGuestQr = (bridge: Bridge, qrToken: string) =>
  request<ScanResult>(bridge, '/staff/scan', { method: 'POST', body: { qrToken } });

export const redeemCoupon = (bridge: Bridge, id: number) =>
  request<{ status: 'redeemed' }>(bridge, `/staff/coupons/${id}/redeem`, { method: 'POST' });

export const fetchStaffOrders = (bridge: Bridge) => request<StaffOrders>(bridge, '/staff/orders');

export const changeOrderStatus = (bridge: Bridge, id: number, status: OrderStatus) =>
  request<{ id: number; status: OrderStatus }>(bridge, `/staff/orders/${id}/status`, {
    method: 'POST',
    body: { status },
  });
