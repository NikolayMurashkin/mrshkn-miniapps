import { randomBytes } from 'node:crypto';
import {
  MAX_APP_LINK_BASE,
  QR_TOKEN_BYTES,
  REFERRAL_CODE_BYTES,
  REFERRAL_CODE_PATTERN,
  REFERRAL_PREFIX,
  STAMPS_PER_COUPON,
  TELEGRAM_APP_LINK_BASE,
} from './consts';
import type { ClientId, LoyaltyStore, Platform, ScanOutcome, StampAward, StampSource } from './types';

export const createQrToken = (): string => randomBytes(QR_TOKEN_BYTES).toString('base64url');

export const createReferralCode = (): string => randomBytes(REFERRAL_CODE_BYTES).toString('base64url');

export const parseReferralCode = (startParam: string | undefined): string | null => {
  if (!startParam?.startsWith(REFERRAL_PREFIX)) {
    return null;
  }

  const code = startParam.slice(REFERRAL_PREFIX.length);

  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
};

export const buildReferralLink = (platform: Platform, botUsername: string, code: string): string | null => {
  if (!botUsername) {
    return null;
  }

  const base = platform === 'telegram' ? TELEGRAM_APP_LINK_BASE : MAX_APP_LINK_BASE;

  return `${base}/${encodeURIComponent(botUsername)}?startapp=${REFERRAL_PREFIX}${code}`;
};

export const stampsOnCard = (total: number): number => total % STAMPS_PER_COUPON;

/** Штамп на карту; каждый десятый за все время выдает купон, карта начинается заново. */
export const awardStamp = async (
  store: LoyaltyStore,
  clientId: ClientId,
  source: StampSource,
  now: Date,
): Promise<StampAward> => {
  await store.addStamp(clientId, source, now);

  const total = await store.countStamps(clientId);
  const couponIssued = stampsOnCard(total) === 0;

  if (couponIssued) {
    await store.issueCoupon(clientId, now);
  }

  return { stamps: stampsOnCard(total), couponIssued };
};

/** Штамп по QR гостя: токен одноразовый — повторный и параллельный скан штамп не дублируют. */
export const accrueStamp = async (qrToken: string, store: LoyaltyStore, now: Date): Promise<ScanOutcome> => {
  const record = await store.findQrToken(qrToken);

  if (!record) {
    return { result: 'not-found' };
  }

  const duplicate = async (): Promise<ScanOutcome> => ({
    result: 'duplicate',
    clientId: record.clientId,
    stamps: stampsOnCard(await store.countStamps(record.clientId)),
  });

  if (record.usedAt) {
    return duplicate();
  }

  if (record.expiresAt.getTime() < now.getTime()) {
    return { result: 'expired' };
  }

  if (!(await store.claimQrToken(qrToken, now))) {
    return duplicate();
  }

  const award = await awardStamp(store, record.clientId, 'scan', now);

  return { result: 'accrued', clientId: record.clientId, ...award };
};
