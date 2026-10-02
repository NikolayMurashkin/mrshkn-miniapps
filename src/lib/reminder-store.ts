import type { Payload, PayloadRequest } from 'payload';
import type { Reminder, ReminderStore } from './types';

export const createReminderStore = (payload: Payload, req?: PayloadRequest): ReminderStore => ({
  insert: async ({ bookingId, kind, sendAt, status }) => {
    await payload.create({
      collection: 'reminders',
      data: { booking: Number(bookingId), kind, sendAt: sendAt.toISOString(), status, attempts: 0 },
      overrideAccess: true,
      req,
    });
  },

  findByBooking: async (bookingId) => {
    const { docs } = await payload.find({
      collection: 'reminders',
      where: { booking: { equals: Number(bookingId) } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    });

    return docs.map((doc): Reminder => ({
      id: doc.id,
      bookingId,
      kind: doc.kind,
      sendAt: new Date(doc.sendAt),
      status: doc.status,
    }));
  },

  setStatus: async (id, status) => {
    await payload.update({
      collection: 'reminders',
      id: Number(id),
      data: { status },
      overrideAccess: true,
      req,
    });
  },
});
