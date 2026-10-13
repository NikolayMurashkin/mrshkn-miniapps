import type { CollectionBeforeChangeHook } from 'payload';
import { createReferralCode } from '../../lib/loyalty';

/** Реферальный код у каждого нового клиента, откуда бы он ни пришел: из Mini App, записи или админки. */
export const assignReferralCode: CollectionBeforeChangeHook = ({ data, operation }) =>
  operation === 'create' && !data.referralCode ? { ...data, referralCode: createReferralCode() } : data;
