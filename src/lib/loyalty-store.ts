import { sql } from '@payloadcms/db-postgres';
import type { Payload, PayloadRequest } from 'payload';
import type { LoyaltyStore } from './types';
import { drizzleOf } from './transaction';

type LoyaltyStoreContext = { req?: PayloadRequest; staffId?: number };

const relationNumber = (value: number | { id: number }): number => (typeof value === 'object' ? value.id : value);

/** Журнал лояльности на Payload; `staffId` — кассир, который сканирует, его пишем в событие штампа. */
export const createLoyaltyStore = (payload: Payload, { req, staffId }: LoyaltyStoreContext = {}): LoyaltyStore => ({
  findQrToken: async (token) => {
    const { docs } = await payload.find({
      collection: 'qr-tokens',
      where: { token: { equals: token } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    });
    const doc = docs[0];

    return doc
      ? {
          clientId: relationNumber(doc.client),
          expiresAt: new Date(doc.expiresAt),
          usedAt: doc.usedAt ? new Date(doc.usedAt) : null,
        }
      : null;
  },

  claimQrToken: async (token, now) => {
    const result = await drizzleOf(payload, req).execute(sql`
      update "qr_tokens" set "used_at" = ${now.toISOString()}::timestamptz, "updated_at" = now()
      where "token" = ${token} and "used_at" is null
    `);

    return (result.rowCount ?? 0) > 0;
  },

  countStamps: async (clientId) => {
    const { totalDocs } = await payload.count({
      collection: 'loyalty-events',
      where: { and: [{ client: { equals: Number(clientId) } }, { type: { in: ['stamp', 'referral'] } }] },
      overrideAccess: true,
      req,
    });

    return totalDocs;
  },

  addStamp: async (clientId, source, now) => {
    await payload.create({
      collection: 'loyalty-events',
      data: {
        client: Number(clientId),
        type: source === 'scan' ? 'stamp' : 'referral',
        at: now.toISOString(),
        ...(source === 'scan' && staffId !== undefined ? { staff: staffId } : {}),
      },
      overrideAccess: true,
      req,
    });
  },

  issueCoupon: async (clientId, now) => {
    await payload.create({
      collection: 'coupons',
      data: { client: Number(clientId), status: 'active', issuedAt: now.toISOString() },
      overrideAccess: true,
      req,
    });
    await payload.create({
      collection: 'loyalty-events',
      data: { client: Number(clientId), type: 'coupon-issued', at: now.toISOString() },
      overrideAccess: true,
      req,
    });
  },
});
