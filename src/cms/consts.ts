import {
  COUPON_STATUSES,
  MENU_CATEGORIES,
  MENU_CATEGORY_LABELS,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  PICKUP_LABELS,
  PICKUP_OPTIONS,
} from '../lib/consts';

export const LOYALTY_GROUP = 'Лояльность';
export const MENU_GROUP = 'Меню и предзаказы';

export const DATE_TIME_ADMIN = { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd.MM.yyyy HH:mm' } } as const;

export const MENU_CATEGORY_OPTIONS = MENU_CATEGORIES.map((value) => ({ label: MENU_CATEGORY_LABELS[value], value }));
export const PICKUP_SELECT_OPTIONS = PICKUP_OPTIONS.map((value) => ({ label: PICKUP_LABELS[value], value }));
export const ORDER_STATUS_OPTIONS = ORDER_STATUSES.map((value) => ({ label: ORDER_STATUS_LABELS[value], value }));

const COUPON_STATUS_LABELS: Record<(typeof COUPON_STATUSES)[number], string> = {
  active: 'Активен',
  redeemed: 'Погашен',
};

export const COUPON_STATUS_OPTIONS = COUPON_STATUSES.map((value) => ({ label: COUPON_STATUS_LABELS[value], value }));

export const LOYALTY_EVENT_OPTIONS = [
  { label: 'Штамп за покупку', value: 'stamp' },
  { label: 'Штамп за приглашенного', value: 'referral' },
  { label: 'Купон выдан', value: 'coupon-issued' },
  { label: 'Купон погашен', value: 'coupon-redeemed' },
];
