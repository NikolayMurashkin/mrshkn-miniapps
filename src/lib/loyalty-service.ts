import type { Payload } from 'payload';
import type { Client } from '../payload-types';
import { CLIENT_LOCK_NAMESPACE, QR_TOKEN_TTL_SEC, SECOND_MS, STAMPS_PER_COUPON } from './consts';
import { botUsername } from './env';
import { ensureGuest, findActiveStaff, findGuest, guestLabel, notifyGuest } from './guests';
import { accrueStamp, buildReferralLink, createQrToken, createReferralCode, stampsOnCard } from './loyalty';
import { createLoyaltyStore } from './loyalty-store';
import { couponIssuedText } from './messages';
import { parseId } from './booking';
import { withLock } from './transaction';
import type { MiniAppAuth, ServiceResult } from './types';

type CouponOut = { id: number; status: 'active' };

const activeCoupons = async (payload: Payload, clientId: number): Promise<CouponOut[]> => {
  const { docs } = await payload.find({
    collection: 'coupons',
    where: { and: [{ client: { equals: clientId } }, { status: { equals: 'active' } }] },
    sort: 'issuedAt',
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });

  return docs.map(({ id }) => ({ id, status: 'active' }));
};

const cardStamps = async (payload: Payload, clientId: number): Promise<number> =>
  stampsOnCard(await createLoyaltyStore(payload).countStamps(clientId));

/** Клиенты, пришедшие до лояльности, получают код при первом открытии карты. */
const referralCodeOf = async (payload: Payload, client: Client): Promise<string> => {
  if (client.referralCode) {
    return client.referralCode;
  }

  const updated = await payload.update({
    collection: 'clients',
    id: client.id,
    data: { referralCode: createReferralCode() },
    overrideAccess: true,
  });

  return updated.referralCode ?? '';
};

export const loyaltyMe = async (payload: Payload, auth: MiniAppAuth, now: Date) => {
  const staff = await findActiveStaff(payload, auth);

  if (staff) {
    return { role: 'staff' as const, name: staff.name };
  }

  const client = await ensureGuest(payload, auth, now);
  const [stamps, coupons, code] = await Promise.all([
    cardStamps(payload, client.id),
    activeCoupons(payload, client.id),
    referralCodeOf(payload, client),
  ]);

  return {
    role: 'guest' as const,
    stamps,
    stampsPerCoupon: STAMPS_PER_COUPON,
    coupons,
    referralLink: buildReferralLink(auth.platform, botUsername(auth.platform), code),
  };
};

export const issueQr = async (payload: Payload, auth: MiniAppAuth, now: Date) => {
  const client = await ensureGuest(payload, auth, now);
  const qrToken = createQrToken();
  const expiresAt = new Date(now.getTime() + QR_TOKEN_TTL_SEC * SECOND_MS).toISOString();

  await payload.create({
    collection: 'qr-tokens',
    data: { token: qrToken, client: client.id, expiresAt },
    overrideAccess: true,
  });

  return { qrToken, expiresAt };
};

export const loyaltyHistory = async (payload: Payload, auth: MiniAppAuth) => {
  const client = await findGuest(payload, auth);

  if (!client) {
    return { events: [] };
  }

  const { docs } = await payload.find({
    collection: 'loyalty-events',
    where: { client: { equals: client.id } },
    sort: ['-at', '-id'],
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });

  return { events: docs.map(({ type, at }) => ({ type, at })) };
};

type ScanBody = {
  result: 'accrued' | 'duplicate';
  guest: { name: string };
  stamps: number;
  couponIssued: boolean;
  coupons: CouponOut[];
};

/** Скан QR гостя кассиром. Блокировка гостя: два скана разных QR не выдадут купон за один десятый штамп дважды. */
export const scanGuestQr = async (
  payload: Payload,
  auth: MiniAppAuth,
  qrToken: unknown,
  now: Date,
): Promise<ServiceResult<ScanBody>> => {
  const staff = await findActiveStaff(payload, auth);

  if (!staff) {
    return { status: 403 };
  }

  if (typeof qrToken !== 'string' || qrToken === '') {
    return { status: 400 };
  }

  const record = await createLoyaltyStore(payload).findQrToken(qrToken);

  if (!record) {
    return { status: 404 };
  }

  const clientId = Number(record.clientId);
  const outcome = await withLock(payload, CLIENT_LOCK_NAMESPACE, clientId, (req) =>
    accrueStamp(qrToken, createLoyaltyStore(payload, { req, staffId: staff.id }), now),
  );

  if (outcome.result === 'not-found') {
    return { status: 404 };
  }

  if (outcome.result === 'expired') {
    return { status: 410 };
  }

  const client = await payload.findByID({ collection: 'clients', id: clientId, depth: 0, overrideAccess: true });
  const couponIssued = outcome.result === 'accrued' && outcome.couponIssued;

  if (couponIssued) {
    await notifyGuest(payload, client, couponIssuedText(STAMPS_PER_COUPON), 'гостю: купон');
  }

  return {
    status: 200,
    body: {
      result: outcome.result,
      guest: { name: guestLabel(client) },
      stamps: outcome.stamps,
      couponIssued,
      coupons: await activeCoupons(payload, clientId),
    },
  };
};

const findCoupon = async (payload: Payload, id: number) => {
  const { docs } = await payload.find({
    collection: 'coupons',
    where: { id: { equals: id } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  return docs[0] ?? null;
};

/** Погашение купона кассиром; повторное — 409, под блокировкой гостя два погашения не пройдут оба. */
export const redeemCoupon = async (
  payload: Payload,
  auth: MiniAppAuth,
  rawId: unknown,
  now: Date,
): Promise<ServiceResult<{ status: 'redeemed' }>> => {
  const staff = await findActiveStaff(payload, auth);

  if (!staff) {
    return { status: 403 };
  }

  const id = parseId(rawId);
  const found = id === null ? null : await findCoupon(payload, id);

  if (!found) {
    return { status: 404 };
  }

  const clientId = typeof found.client === 'object' ? found.client.id : found.client;
  const redeemed = await withLock(payload, CLIENT_LOCK_NAMESPACE, clientId, async (req) => {
    const fresh = await payload.findByID({ collection: 'coupons', id: found.id, depth: 0, overrideAccess: true, req });

    if (fresh.status !== 'active') {
      return false;
    }

    await payload.update({
      collection: 'coupons',
      id: found.id,
      data: { status: 'redeemed', redeemedAt: now.toISOString(), redeemedBy: staff.id },
      overrideAccess: true,
      req,
    });
    await payload.create({
      collection: 'loyalty-events',
      data: { client: clientId, type: 'coupon-redeemed', at: now.toISOString(), staff: staff.id },
      overrideAccess: true,
      req,
    });

    return true;
  });

  return redeemed ? { status: 200, body: { status: 'redeemed' } } : { status: 409 };
};
