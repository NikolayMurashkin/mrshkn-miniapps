import type { LOYALTY_EVENT_TYPES, ORDER_STATUSES, PICKUP_OPTIONS } from '@/lib/consts';

export type Cart = Record<string, number>;

export type Coupon = { id: number; status: 'active' };
export type GuestMe = {
  role: 'guest';
  stamps: number;
  stampsPerCoupon: number;
  coupons: Coupon[];
  referralLink: string | null;
};
export type StaffMe = { role: 'staff'; name: string };
export type Me = GuestMe | StaffMe;

export type QrTicket = { qrToken: string; expiresAt: string };
export type QrImage = { token: string; expiresAt: number; src: string };

export type LoyaltyEventType = (typeof LOYALTY_EVENT_TYPES)[number];
export type HistoryEvent = { type: LoyaltyEventType; at: string };

export type MenuItem = { id: string | number; name: string; description: string; price: number; category: string };

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type Pickup = (typeof PICKUP_OPTIONS)[number];
export type OrderLine = { name: string; qty: number };
export type GuestOrder = { id: number; status: OrderStatus; total: number; items: OrderLine[] };
export type StaffOrder = GuestOrder & { pickup: Pickup; pickupAt: string | null; guest: { name: string } };
export type StaffOrders = { orders: StaffOrder[]; timeZone: string };

export type ScanResult = {
  result: 'accrued' | 'duplicate';
  guest: { name: string };
  stamps: number;
  couponIssued: boolean;
  coupons: Coupon[];
};

export type ApiFailureKind = 'unauthorized' | 'forbidden' | 'not-found' | 'conflict' | 'gone' | 'failed' | 'network';
export type ApiResult<T> = { kind: 'ok'; data: T } | { kind: ApiFailureKind };

export type LoadStatus = 'loading' | 'ready' | 'unauthorized' | 'network' | 'failed';
export type SubmitStatus = 'idle' | 'sending' | 'done' | 'conflict' | 'failed' | 'network';

export type GuestTab = 'card' | 'menu' | 'history' | 'invite';
export type StaffTab = 'scanner' | 'orders';
export type TabItem<T extends string> = { id: T; label: string };

export type CardNotice = 'stamp' | 'coupon' | 'redeemed';
export type CopyStatus = 'idle' | 'copied' | 'failed';
