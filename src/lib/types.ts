import type { PayloadRequest } from 'payload';
import type { Master, Service } from '../payload-types';
import type { ORDER_STATUSES, PICKUP_OPTIONS, PLATFORMS, STAMP_SOURCES } from './consts';
import type { InitDataResult } from './init-data';

export type ReminderKind = '24h' | '2h';
type ReminderStatus = 'pending' | 'sent' | 'cancelled' | 'failed';

export type Reminder = {
  id: string | number;
  bookingId: string | number;
  kind: ReminderKind;
  sendAt: Date;
  status: ReminderStatus;
};

export type ReminderStore = {
  insert(r: { bookingId: string | number; kind: ReminderKind; sendAt: Date; status: 'pending' }): Promise<void>;
  findByBooking(bookingId: string | number): Promise<Reminder[]>;
  setStatus(id: string | number, status: ReminderStatus): Promise<void>;
};

export type Platform = (typeof PLATFORMS)[number];
export type CrmEvent = 'booking.created' | 'booking.updated' | 'booking.cancelled';
export type CrmOutcome = 'sent' | 'failed' | 'skipped';

type MiniAppUser = Extract<InitDataResult, { ok: true }>['user'];
export type MiniAppAuth = { platform: Platform; user: MiniAppUser; startParam?: string };

export type BusinessSettings = { timeZone: string; slotStepMin: number };

export type BookingOutcome = { status: 201; id: number } | { status: 400 | 404 | 409 };
export type CancelOutcome = { status: 200 | 404 | 409 };

export type BookingText = {
  serviceName: string;
  masterName: string;
  startAt: Date;
  timeZone: string;
};

export type SlotsInput = {
  master: Master;
  service: Service;
  date: string;
  settings: BusinessSettings;
  now: Date;
  req?: PayloadRequest;
  excludeBookingId?: number;
};

export type CreateBookingInput = {
  auth: MiniAppAuth;
  serviceId: unknown;
  masterId: unknown;
  startAt: unknown;
  now: Date;
};
export type CancelBookingInput = { auth: MiniAppAuth; bookingId: unknown; now: Date };

export type BookingChange = 'created' | 'moved' | 'cancelled';
export type SlotCheck = { serviceId: unknown; masterId: unknown; startAt: unknown; excludeBookingId?: number };

export type ClientId = string | number;
export type StampSource = (typeof STAMP_SOURCES)[number];

export type QrTokenRecord = { clientId: ClientId; expiresAt: Date; usedAt: Date | null };

export type LoyaltyStore = {
  findQrToken(token: string): Promise<QrTokenRecord | null>;
  /** Атомарно помечает токен использованным; false — его уже использовали. */
  claimQrToken(token: string, now: Date): Promise<boolean>;
  /** Всего штампов клиента за все время (скан + реферал). */
  countStamps(clientId: ClientId): Promise<number>;
  addStamp(clientId: ClientId, source: StampSource, now: Date): Promise<void>;
  issueCoupon(clientId: ClientId, now: Date): Promise<void>;
};

/** stamps — штампы на карте после операции (0–9). */
export type ScanOutcome =
  | { result: 'accrued'; clientId: ClientId; stamps: number; couponIssued: boolean }
  | { result: 'duplicate'; clientId: ClientId; stamps: number }
  | { result: 'not-found' }
  | { result: 'expired' };

export type StampAward = { stamps: number; couponIssued: boolean };

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type Pickup = (typeof PICKUP_OPTIONS)[number];
export type OrderLineInput = { id: number; qty: number };

export type ServiceResult<T> = { status: 200 | 201; body: T } | { status: 400 | 403 | 404 | 409 | 410 };

export type OrderText = {
  id: number;
  lines: { name: string; price: number; qty: number }[];
  total: number;
  pickupLabel: string;
  clientLabel: string;
  platformLabel: string;
};
