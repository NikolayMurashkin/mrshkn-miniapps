import { Forbidden, ValidationError } from 'payload';
import type {
  CollectionAfterChangeHook,
  CollectionBeforeOperationHook,
  CollectionBeforeValidateHook,
  Payload,
  PayloadRequest,
} from 'payload';
import type { Booking } from '../../payload-types';
import {
  loadMaster,
  loadService,
  loadSettings,
  masterServes,
  parseId,
  relationId,
  slotsForDay,
} from '../../lib/booking';
import { MINUTE_MS, SKIP_BOOKING_HOOKS } from '../../lib/consts';
import { syncCrm } from '../../lib/crm';
import { clientChangeText } from '../../lib/messages';
import { sendToClient } from '../../lib/messenger';
import { logSideEffects } from '../../lib/notify';
import { cancelReminders, scheduleReminders } from '../../lib/reminders';
import { createReminderStore } from '../../lib/reminder-store';
import { localDateOf } from '../../lib/slots';
import { lockMaster } from '../../lib/transaction';
import type { BookingChange, SlotCheck } from '../../lib/types';

const fail = (message: string, path: string, req: PayloadRequest): never => {
  throw new ValidationError({ collection: 'bookings', errors: [{ message, path }], req });
};

/** Хуки работают только на правки залогиненного; путь Mini App, тик и служебные обновления идут без `req.user` или с флагом. */
const isAdminEdit = (req: PayloadRequest): boolean => Boolean(req.user) && !req.context[SKIP_BOOKING_HOOKS];

/** Проверка слота под блокировкой мастера в транзакции запроса; возвращает endAt. */
const checkSlot = async (payload: Payload, req: PayloadRequest, check: SlotCheck): Promise<Date> => {
  const [service, master] = await Promise.all([
    loadService(payload, check.serviceId, req),
    loadMaster(payload, check.masterId, req),
  ]);
  const startAt = typeof check.startAt === 'string' ? new Date(check.startAt) : null;

  if (!service) {
    return fail('Услуга не найдена', 'service', req);
  }

  if (!master) {
    return fail('Мастер не найден', 'master', req);
  }

  if (!startAt || Number.isNaN(startAt.getTime())) {
    return fail('Некорректное время', 'startAt', req);
  }

  if (!masterServes(master, service)) {
    return fail('Мастер не оказывает эту услугу', 'master', req);
  }

  if (!req.transactionID) {
    throw new Error('запись из админки требует транзакции Payload');
  }

  await lockMaster(payload, req, master.id);

  const settings = await loadSettings(payload, req);
  const slots = await slotsForDay(payload, {
    master,
    service,
    date: localDateOf(startAt, settings.timeZone),
    settings,
    now: new Date(),
    req,
    excludeBookingId: check.excludeBookingId,
  });

  if (!slots.some((slot) => slot.getTime() === startAt.getTime())) {
    return fail('Время недоступно: вне расписания, в перерыве или занято', 'startAt', req);
  }

  return new Date(startAt.getTime() + service.durationMin * MINUTE_MS);
};

/** Поля пишет только сервер: при правке одной записи берутся из базы, пока хук их не пересчитал. */
const serverFieldsOf = ({ endAt, platform, crmStatus, crmEvent, crmAttempts }: Booking): Partial<Booking> => ({
  endAt,
  platform,
  crmStatus,
  crmEvent,
  crmAttempts,
});

const isMoved = (previous: Partial<Booking>, next: Partial<Booking>): boolean =>
  next.service !== undefined &&
  next.master !== undefined &&
  previous.service !== undefined &&
  previous.master !== undefined &&
  (relationId(next.service) !== relationId(previous.service) ||
    relationId(next.master) !== relationId(previous.master) ||
    new Date(String(next.startAt)).getTime() !== new Date(String(previous.startAt)).getTime());

/**
 * Массовый update Payload ведет документы параллельно в одной транзакции: блокировка мастера повторно входима,
 * проверка слота каждого документа не видит соседние → двойная запись. Админку и REST закрывает `disableBulkEdit`
 * коллекции, хук — остальные вызовы (`overrideAccess: true`). Правка по id (`id` задан, как в диспетчере Local API) не затронута.
 */
export const rejectBulkUpdate: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if (operation === 'update' && !(args as { id?: unknown }).id) {
    throw new Forbidden(req.t);
  }

  return args;
};

export const bookingBeforeValidate: CollectionBeforeValidateHook<Booking> = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data || !isAdminEdit(req)) {
    return data;
  }

  const { payload } = req;

  if (operation === 'create') {
    const clientId = parseId(data.client && relationId(data.client));
    const client =
      clientId === null
        ? undefined
        : await payload.findByID({
            collection: 'clients',
            id: clientId,
            depth: 0,
            overrideAccess: true,
            req,
            disableErrors: true,
          });

    if (!client) {
      return fail('Клиент не найден', 'client', req);
    }

    const endAt = await checkSlot(payload, req, {
      serviceId: data.service,
      masterId: data.master,
      startAt: data.startAt,
    });

    return {
      ...data,
      endAt: endAt.toISOString(),
      platform: client.platform,
      status: 'active',
      crmEvent: 'booking.created',
      crmStatus: 'pending',
      crmAttempts: 0,
    };
  }

  if (!originalDoc) {
    return data;
  }

  if (originalDoc.status === 'cancelled') {
    return fail('Отмененную запись менять нельзя', 'status', req);
  }

  if (data.status === 'cancelled') {
    return {
      ...data,
      ...serverFieldsOf(originalDoc),
      service: originalDoc.service,
      master: originalDoc.master,
      startAt: originalDoc.startAt,
      crmEvent: 'booking.cancelled',
      crmStatus: 'pending',
      crmAttempts: 0,
    };
  }

  const next = {
    service: data.service ?? originalDoc.service,
    master: data.master ?? originalDoc.master,
    startAt: data.startAt ?? originalDoc.startAt,
  };

  if (!isMoved(originalDoc, next)) {
    return { ...data, ...serverFieldsOf(originalDoc) };
  }

  const endAt = await checkSlot(payload, req, {
    serviceId: relationId(next.service),
    masterId: relationId(next.master),
    startAt: next.startAt,
    excludeBookingId: originalDoc.id,
  });

  return {
    ...data,
    ...serverFieldsOf(originalDoc),
    ...next,
    endAt: endAt.toISOString(),
    crmEvent: 'booking.updated',
    crmStatus: 'pending',
    crmAttempts: 0,
  };
};

const detectChange = (operation: string, previous: Partial<Booking>, doc: Booking): BookingChange | null => {
  if (operation === 'create') {
    return doc.status === 'active' ? 'created' : null;
  }

  if (previous.status !== 'active') {
    return null;
  }

  if (doc.status === 'cancelled') {
    return 'cancelled';
  }

  return isMoved(previous, doc) ? 'moved' : null;
};

/**
 * Все обновления идут с `req` хука (одна транзакция): `update` той же записи без `req` ждал бы блокировку строки,
 * которую держит еще не зафиксированная транзакция хука.
 */
export const bookingAfterChange: CollectionAfterChangeHook<Booking> = async ({ doc, operation, previousDoc, req }) => {
  const change = isAdminEdit(req) ? detectChange(operation, previousDoc, doc) : null;

  if (!change) {
    return doc;
  }

  const { payload } = req;
  const booking = await payload.findByID({ collection: 'bookings', id: doc.id, depth: 1, overrideAccess: true, req });

  if (typeof booking.service !== 'object' || typeof booking.master !== 'object' || typeof booking.client !== 'object') {
    throw new Error(`запись ${doc.id}: связи не раскрыты`);
  }

  const startAt = new Date(booking.startAt);
  const { timeZone } = await loadSettings(payload, req);
  const store = createReminderStore(payload, req);

  if (change !== 'created') {
    await cancelReminders(booking.id, store);
  }

  if (change !== 'cancelled') {
    await scheduleReminders({ id: booking.id, startAt }, store, new Date());
  }

  const text = { serviceName: booking.service.name, masterName: booking.master.name, startAt, timeZone };

  logSideEffects(
    payload,
    await Promise.allSettled([
      sendToClient(booking.client.platform, booking.client.platformUserId, clientChangeText(change, text)),
      syncCrm(payload, booking, 0, req),
    ]),
    ['клиенту', 'CRM'],
  );

  return doc;
};
