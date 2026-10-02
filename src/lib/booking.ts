import type { Payload, PayloadRequest, Where } from 'payload';
import type { Booking, Client, Master, Service } from '../payload-types';
import { syncCrm } from './crm';
import { DEFAULT_SLOT_STEP_MIN, DEFAULT_TIME_ZONE, MINUTE_MS, PLATFORM_LABELS } from './consts';
import { clientConfirmationText, ownerNewBookingText } from './messages';
import { sendToClient, sendToOwner } from './messenger';
import { logSideEffects } from './notify';
import { createReminderStore } from './reminder-store';
import { generateSlots, localDateOf, nextDate, weekdayOf, zonedToInstant } from './slots';
import { cancelReminders, scheduleReminders } from './reminders';
import { withMasterLock } from './transaction';
import type {
  BookingOutcome,
  BookingText,
  BusinessSettings,
  CancelBookingInput,
  CancelOutcome,
  CreateBookingInput,
  MiniAppAuth,
  SlotsInput,
} from './types';

/** Числовой id из строки или числа; иначе null (Postgres-id коллекций целые). */
export const parseId = (value: unknown): number | null => {
  const id = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;

  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
};

export const relationId = (value: number | { id: number }): number => (typeof value === 'object' ? value.id : value);

export const loadSettings = async (payload: Payload, req?: PayloadRequest): Promise<BusinessSettings> => {
  const settings = await payload.findGlobal({ slug: 'settings', depth: 0, overrideAccess: true, req });

  return {
    timeZone: settings.timeZone || DEFAULT_TIME_ZONE,
    slotStepMin: settings.slotStepMin || DEFAULT_SLOT_STEP_MIN,
  };
};

const findOneById = async (
  payload: Payload,
  collection: 'services' | 'masters',
  rawId: unknown,
  req?: PayloadRequest,
) => {
  const id = parseId(rawId);

  if (id === null) {
    return null;
  }

  const { docs } = await payload.find({
    collection,
    where: { id: { equals: id } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  });

  return docs[0] ?? null;
};

export const loadService = async (payload: Payload, rawId: unknown, req?: PayloadRequest): Promise<Service | null> =>
  (await findOneById(payload, 'services', rawId, req)) as Service | null;

export const loadMaster = async (payload: Payload, rawId: unknown, req?: PayloadRequest): Promise<Master | null> =>
  (await findOneById(payload, 'masters', rawId, req)) as Master | null;

export const masterServes = (master: Master, service: Service): boolean =>
  master.services.some((item) => relationId(item) === service.id);

export const slotsForDay = async (payload: Payload, input: SlotsInput): Promise<Date[]> => {
  const { master, service, date, settings, now, req, excludeBookingId } = input;
  const schedule = master.schedule?.find((day) => day.weekday === weekdayOf(date));
  const dayStart = zonedToInstant(date, '00:00', settings.timeZone);
  const dayEnd = zonedToInstant(nextDate(date), '00:00', settings.timeZone);
  const { docs } = await payload.find({
    collection: 'bookings',
    where: {
      and: [
        { master: { equals: master.id } },
        ...(excludeBookingId === undefined ? [] : [{ id: { not_equals: excludeBookingId } }]),
        { status: { equals: 'active' } },
        { startAt: { less_than: dayEnd.toISOString() } },
        { endAt: { greater_than: dayStart.toISOString() } },
      ],
    },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  });

  return generateSlots({
    date,
    timeZone: settings.timeZone,
    workday: schedule
      ? {
          start: schedule.start,
          end: schedule.end,
          breaks: (schedule.breaks ?? []).map(({ start, end }) => ({ start, end })),
        }
      : null,
    durationMin: service.durationMin,
    stepMin: settings.slotStepMin,
    busy: docs.map((doc) => ({ start: new Date(doc.startAt), end: new Date(doc.endAt) })),
    now,
  });
};

const ensureClient = async (payload: Payload, { platform, user }: MiniAppAuth): Promise<Client> => {
  const platformUserId = String(user.id);
  const where: Where = { and: [{ platform: { equals: platform } }, { platformUserId: { equals: platformUserId } }] };
  const findExisting = async (): Promise<Client | undefined> =>
    (await payload.find({ collection: 'clients', where, limit: 1, depth: 0, overrideAccess: true })).docs[0];

  const existing = await findExisting();

  if (existing) {
    return existing;
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;

  try {
    return await payload.create({
      collection: 'clients',
      data: { platform, platformUserId, name },
      overrideAccess: true,
    });
  } catch (error) {
    const concurrent = await findExisting();

    if (!concurrent) {
      throw error;
    }

    return concurrent;
  }
};

export const createBooking = async (payload: Payload, input: CreateBookingInput): Promise<BookingOutcome> => {
  const { auth, now } = input;
  const startAt = typeof input.startAt === 'string' ? new Date(input.startAt) : null;

  if (!startAt || Number.isNaN(startAt.getTime())) {
    return { status: 400 };
  }

  const [service, master, settings] = await Promise.all([
    loadService(payload, input.serviceId),
    loadMaster(payload, input.masterId),
    loadSettings(payload),
  ]);

  if (!service || !master) {
    return { status: 404 };
  }

  if (!masterServes(master, service)) {
    return { status: 409 };
  }

  const client = await ensureClient(payload, auth);
  const endAt = new Date(startAt.getTime() + service.durationMin * MINUTE_MS);

  const bookingId = await withMasterLock(payload, master.id, async (req) => {
    const slots = await slotsForDay(payload, {
      master,
      service,
      date: localDateOf(startAt, settings.timeZone),
      settings,
      now,
      req,
    });

    if (!slots.some((slot) => slot.getTime() === startAt.getTime())) {
      return null;
    }

    const booking = await payload.create({
      collection: 'bookings',
      data: {
        service: service.id,
        master: master.id,
        client: client.id,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        platform: auth.platform,
        status: 'active',
        crmStatus: 'pending',
        crmEvent: 'booking.created',
        crmAttempts: 0,
      },
      overrideAccess: true,
      req,
    });

    await scheduleReminders({ id: booking.id, startAt }, createReminderStore(payload, req), now);

    return booking.id;
  });

  if (bookingId === null) {
    return { status: 409 };
  }

  const booking = await payload.findByID({ collection: 'bookings', id: bookingId, depth: 1, overrideAccess: true });
  const text: BookingText = {
    serviceName: service.name,
    masterName: master.name,
    startAt,
    timeZone: settings.timeZone,
  };
  const clientLabel = client.name || (auth.user.username ? `@${auth.user.username}` : String(auth.user.id));

  logSideEffects(
    payload,
    await Promise.allSettled([
      sendToOwner(ownerNewBookingText(text, clientLabel, PLATFORM_LABELS[auth.platform])),
      sendToClient(auth.platform, auth.user.id, clientConfirmationText(text)),
      syncCrm(payload, booking, 0),
    ]),
    ['владельцу', 'клиенту', 'CRM'],
  );

  return { status: 201, id: bookingId };
};

const isOwnedBy = (booking: Booking, { platform, user }: MiniAppAuth): boolean =>
  typeof booking.client === 'object' &&
  booking.client.platform === platform &&
  booking.client.platformUserId === String(user.id);

export const cancelBooking = async (payload: Payload, input: CancelBookingInput): Promise<CancelOutcome> => {
  const { auth, now } = input;
  const id = parseId(input.bookingId);

  if (id === null) {
    return { status: 404 };
  }

  const found = await payload.find({
    collection: 'bookings',
    where: { id: { equals: id } },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  });
  const existing = found.docs[0];

  if (!existing || !isOwnedBy(existing, auth)) {
    return { status: 404 };
  }

  const cancelled = await withMasterLock(payload, relationId(existing.master), async (req) => {
    const fresh = await payload.findByID({ collection: 'bookings', id, depth: 0, overrideAccess: true, req });

    if (fresh.status !== 'active' || new Date(fresh.startAt).getTime() <= now.getTime()) {
      return false;
    }

    await payload.update({
      collection: 'bookings',
      id,
      data: { status: 'cancelled', crmEvent: 'booking.cancelled', crmStatus: 'pending', crmAttempts: 0 },
      overrideAccess: true,
      req,
    });
    await cancelReminders(id, createReminderStore(payload, req));

    return true;
  });

  if (!cancelled) {
    return { status: 409 };
  }

  const booking = await payload.findByID({ collection: 'bookings', id, depth: 1, overrideAccess: true });

  logSideEffects(payload, await Promise.allSettled([syncCrm(payload, booking, 0)]), ['CRM']);

  return { status: 200 };
};
