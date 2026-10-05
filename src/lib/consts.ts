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
