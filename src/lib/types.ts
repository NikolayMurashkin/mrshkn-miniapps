import type { PayloadRequest } from 'payload';
import type { Master, Service } from '../payload-types';
import type { PLATFORMS } from './consts';
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
export type MiniAppAuth = { platform: Platform; user: MiniAppUser };

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
