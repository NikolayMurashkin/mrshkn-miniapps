import type { Bridge } from '@/bridge/types';
import { API_BASE } from './consts';
import type { ApiResult, Catalog, NetworkFailure } from './types';

const request = async <T>(
  bridge: Bridge,
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T> | NetworkFailure> => {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `tma ${bridge.initData}`,
        'X-Mini-App-Platform': bridge.platform,
      },
    });
  } catch {
    return { kind: 'network' };
  }

  if (response.status === 401) {
    return { kind: 'unauthorized' };
  }

  if (response.status === 409) {
    return { kind: 'conflict' };
  }

  if (!response.ok) {
    return { kind: 'failed' };
  }

  try {
    return { kind: 'ok', data: (await response.json()) as T };
  } catch {
    return { kind: 'failed' };
  }
};

export const fetchCatalog = (bridge: Bridge) => request<Catalog>(bridge, '/catalog');

export const fetchSlots = (bridge: Bridge, params: { serviceId: number; masterId: number; date: string }) => {
  const query = new URLSearchParams({
    serviceId: String(params.serviceId),
    masterId: String(params.masterId),
    date: params.date,
  });

  return request<{ slots: string[] }>(bridge, `/slots?${query.toString()}`);
};

export const createBooking = (bridge: Bridge, body: { serviceId: number; masterId: number; startAt: string }) =>
  request<{ id: number }>(bridge, '/bookings', { method: 'POST', body: JSON.stringify(body) });
