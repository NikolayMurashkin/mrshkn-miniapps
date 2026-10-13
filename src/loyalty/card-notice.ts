import type { CardNotice, GuestMe } from './types';

/** Что изменилось на карте гостя между опросами: купон важнее штампа, без изменений — без заметки. */
export const noticeFor = (before: GuestMe, after: GuestMe): CardNotice | null => {
  if (after.coupons.length > before.coupons.length) {
    return 'coupon';
  }

  if (after.coupons.length < before.coupons.length) {
    return 'redeemed';
  }

  return after.stamps !== before.stamps ? 'stamp' : null;
};
