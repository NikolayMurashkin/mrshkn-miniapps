export const INIT_DATA_MAX_AGE_SEC = 86400;
export const CRM_MAX_ATTEMPTS = 5;
export const REQUEST_TIMEOUT_MS = 5000;
export const HOUR_MS = 3_600_000;
export const MINUTE_MS = 60_000;

export const DEFAULT_TIME_ZONE = 'Europe/Kaliningrad';
export const DEFAULT_SLOT_STEP_MIN = 30;

export const DEFAULT_TELEGRAM_API_BASE = 'https://api.telegram.org';
export const DEFAULT_MAX_API_BASE = 'https://platform-api.max.ru';

export const PLATFORMS = ['telegram', 'max'] as const;
export const PLATFORM_LABELS = { telegram: 'Telegram', max: 'MAX' } as const;
export const PLATFORM_OPTIONS = PLATFORMS.map((value) => ({ label: PLATFORM_LABELS[value], value }));
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const SLOT_STEPS_MIN: number[] = [15, 30, 60];
export const ADVISORY_LOCK_NAMESPACE = 23;
export const TICK_CRON = '* * * * *';
export const TICK_QUEUE = 'default';
export const TICK_TASK_SLUG = 'tick';
export const SKIP_BOOKING_HOOKS = 'skipBookingHooks';
export const REMINDER_MAX_ATTEMPTS = 5;
/** Mini App не для поиска: страницы, API и админка любого экземпляра закрыты от индексации. */
export const ROBOTS_TAG = 'noindex, nofollow';

export const STAMPS_PER_COUPON = 10;
/** QR гостя одноразовый и живет 5 минут: экран сам запрашивает новый. */
export const QR_TOKEN_TTL_SEC = 300;
export const QR_TOKEN_BYTES = 24;
export const REFERRAL_CODE_BYTES = 9;
export const REFERRAL_PREFIX = 'ref_';
export const REFERRAL_CODE_PATTERN = /^[A-Za-z0-9_-]{6,32}$/;
export const TELEGRAM_APP_LINK_BASE = 'https://t.me';
export const MAX_APP_LINK_BASE = 'https://max.ru';
export const CLIENT_LOCK_NAMESPACE = 24;
export const ORDER_LOCK_NAMESPACE = 25;
export const SECOND_MS = 1000;

export const STAMP_SOURCES = ['scan', 'referral'] as const;
export const LOYALTY_EVENT_TYPES = ['stamp', 'referral', 'coupon-issued', 'coupon-redeemed'] as const;
export const COUPON_STATUSES = ['active', 'redeemed'] as const;

export const MENU_CATEGORIES = ['coffee', 'tea', 'bakery', 'breakfast'] as const;
export const MENU_CATEGORY_LABELS = {
  coffee: 'Кофе',
  tea: 'Чай и не кофе',
  bakery: 'Выпечка',
  breakfast: 'Завтраки',
} as const;

export const MAX_ORDER_QTY = 20;
export const PICKUP_OPTIONS = ['asap', 'in15', 'in30'] as const;
export const PICKUP_LABELS = { asap: 'Как можно скорее', in15: 'Через 15 минут', in30: 'Через 30 минут' } as const;
export const PICKUP_DELAY_MIN = { asap: null, in15: 15, in30: 30 } as const;

export const ORDER_STATUSES = ['new', 'preparing', 'ready', 'done', 'cancelled'] as const;
export const ORDER_STATUS_LABELS = {
  new: 'Новый',
  preparing: 'Готовится',
  ready: 'Готов',
  done: 'Выдан',
  cancelled: 'Отменен',
} as const;
/** Куда кассир может перевести заказ из каждого статуса. */
export const ORDER_TRANSITIONS = {
  new: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['done'],
  done: [],
  cancelled: [],
} as const;
export const OPEN_ORDER_STATUSES = ['new', 'preparing', 'ready'] as const;
