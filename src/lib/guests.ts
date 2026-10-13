import type { Payload, PayloadRequest, Where } from 'payload';
import type { Client, Staff } from '../payload-types';
import { CLIENT_LOCK_NAMESPACE, STAMPS_PER_COUPON } from './consts';
import { awardStamp, parseReferralCode } from './loyalty';
import { createLoyaltyStore } from './loyalty-store';
import { couponIssuedText } from './messages';
import { sendToClient } from './messenger';
import { logSideEffects } from './notify';
import { withLock } from './transaction';
import type { MiniAppAuth } from './types';

const byPlatformUser = ({ platform, user }: MiniAppAuth): Where => ({
  and: [{ platform: { equals: platform } }, { platformUserId: { equals: String(user.id) } }],
});

/** Кассир из админки; уволенный (`active: false`) кассиром не считается. */
export const findActiveStaff = async (payload: Payload, auth: MiniAppAuth): Promise<Staff | null> => {
  const { docs } = await payload.find({
    collection: 'staff',
    where: { and: [byPlatformUser(auth), { active: { equals: true } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  return docs[0] ?? null;
};

export const findGuest = async (payload: Payload, auth: MiniAppAuth): Promise<Client | null> => {
  const { docs } = await payload.find({
    collection: 'clients',
    where: byPlatformUser(auth),
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  return docs[0] ?? null;
};

const nameOf = ({ user }: MiniAppAuth): string | undefined =>
  [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;

/** Имя гостя для кассира и владельца: имя из мессенджера, иначе ID. */
export const guestLabel = (client: Pick<Client, 'name' | 'platformUserId'>): string =>
  client.name || client.platformUserId;

/** Сообщение гостю ботом его платформы; сбой доставки — в лог, операцию не отменяет. */
export const notifyGuest = async (payload: Payload, client: Client, text: string, label: string): Promise<void> => {
  logSideEffects(payload, await Promise.allSettled([sendToClient(client.platform, client.platformUserId, text)]), [
    label,
  ]);
};

const findReferrer = async (payload: Payload, startParam: string | undefined): Promise<Client | null> => {
  const code = parseReferralCode(startParam);

  if (!code) {
    return null;
  }

  const { docs } = await payload.find({
    collection: 'clients',
    where: { referralCode: { equals: code } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  return docs[0] ?? null;
};

const createGuest = (payload: Payload, auth: MiniAppAuth, referrerId?: number, req?: PayloadRequest) =>
  payload.create({
    collection: 'clients',
    data: {
      platform: auth.platform,
      platformUserId: String(auth.user.id),
      name: nameOf(auth),
      ...(referrerId === undefined ? {} : { referredBy: referrerId }),
    },
    overrideAccess: true,
    req,
  });

/**
 * Приглашенный гость и бонус пригласившему — одна транзакция под блокировкой пригласившего: сбой бонуса откатывает
 * и гостя, повторный вход начнет заново. Бонус — такой же штамп, как за покупку: десятый выдает купон.
 */
const createReferredGuest = async (payload: Payload, auth: MiniAppAuth, referrer: Client, now: Date) => {
  const { client, award } = await withLock(payload, CLIENT_LOCK_NAMESPACE, referrer.id, async (req) => ({
    client: await createGuest(payload, auth, referrer.id, req),
    award: await awardStamp(createLoyaltyStore(payload, { req }), referrer.id, 'referral', now),
  }));

  if (award.couponIssued) {
    await notifyGuest(payload, referrer, couponIssuedText(STAMPS_PER_COUPON), 'гостю: купон');
  }

  return client;
};

/**
 * Гость экземпляра; при первом входе создается. Реферальный бонус получает только тот вызов, чья вставка прошла:
 * уникальный индекс platform + platformUserId не пустит второй параллельный первый вход, его транзакция откатится.
 */
export const ensureGuest = async (payload: Payload, auth: MiniAppAuth, now: Date): Promise<Client> => {
  const existing = await findGuest(payload, auth);

  if (existing) {
    return existing;
  }

  const referrer = await findReferrer(payload, auth.startParam);

  try {
    return referrer ? await createReferredGuest(payload, auth, referrer, now) : await createGuest(payload, auth);
  } catch (error) {
    const concurrent = await findGuest(payload, auth);

    if (!concurrent) {
      throw error;
    }

    return concurrent;
  }
};
