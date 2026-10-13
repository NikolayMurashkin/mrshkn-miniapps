import { MAX_ORDER_QTY, ORDER_STATUS_LABELS, PICKUP_LABELS, STAMPS_PER_COUPON } from '@/lib/consts';
import type { ApiFailureKind, CardNotice, GuestTab, LoyaltyEventType, OrderStatus, StaffTab, TabItem } from './types';

export {
  DEFAULT_TIME_ZONE,
  MENU_CATEGORIES,
  MENU_CATEGORY_LABELS,
  OPEN_ORDER_STATUSES,
  ORDER_TRANSITIONS,
  PICKUP_OPTIONS,
} from '@/lib/consts';
export { ORDER_STATUS_LABELS, PICKUP_LABELS, STAMPS_PER_COUPON };

export const API_BASE = '/api/miniapp';
export const LOCALE = 'ru-RU';
export const MAX_QTY = MAX_ORDER_QTY;
export const ORDER_BUTTON_TEXT = 'Оформить заказ';

/** Экран QR опрашивает карту раз в секунду: штамп у гостя появляется сразу после скана. */
export const QR_POLL_MS = 1000;
export const ORDERS_POLL_MS = 10_000;

export const GUEST_TABS: TabItem<GuestTab>[] = [
  { id: 'card', label: 'Карта' },
  { id: 'menu', label: 'Меню' },
  { id: 'history', label: 'История' },
  { id: 'invite', label: 'Пригласить' },
];

export const STAFF_TABS: TabItem<StaffTab>[] = [
  { id: 'scanner', label: 'Сканер' },
  { id: 'orders', label: 'Заказы' },
];

export const EVENT_LABELS: Record<LoyaltyEventType, string> = {
  stamp: 'Штамп за\u00a0покупку',
  referral: 'Штамп за\u00a0приглашенного друга',
  'coupon-issued': 'Купон: напиток в\u00a0подарок',
  'coupon-redeemed': 'Купон погашен',
};

export const CARD_NOTICES: Record<CardNotice, string> = {
  stamp: '+1 штамп',
  coupon: '+1 штамп — и\u00a0купон на\u00a0напиток в\u00a0подарок',
  redeemed: 'Купон погашен',
};

/** Кнопка кассира для перехода заказа в этот статус. */
export const STATUS_ACTIONS: Partial<Record<OrderStatus, string>> = {
  preparing: 'Начать готовить',
  ready: 'Готов к\u00a0выдаче',
  done: 'Выдан гостю',
  cancelled: 'Отменить',
};

export const STAMP_WORDS: [string, string, string] = ['штамп', 'штампа', 'штампов'];

export const TEXTS = {
  loading: 'Загрузка…',
  unauthorized: 'Откройте приложение из\u00a0чата с\u00a0ботом',
  network: 'Не получилось загрузить. Проверьте интернет',
  loadFailed: 'Не получилось загрузить. Попробуйте еще раз',
  retry: 'Повторить',
  cardTitle: 'Ваша карта',
  stampsOf: 'из',
  nextIsGift: 'Следующий штамп — напиток в\u00a0подарок',
  more: 'Еще',
  untilGift: 'до\u00a0подарка',
  giftLabel: 'Напиток в\u00a0подарок',
  qrTitle: 'QR для кассира',
  qrAlt: 'QR-код карты гостя',
  qrHint: 'Покажите кассиру: он\u00a0отсканирует код и\u00a0поставит штамп. Код обновляется сам.',
  qrFailed: 'Не получилось показать QR',
  couponsTitle: 'Купоны',
  couponHint: 'Покажите QR кассиру — он\u00a0погасит купон',
  menuTitle: 'Меню',
  myOrdersTitle: 'Ваши заказы',
  orderNumber: 'Заказ №',
  cartTitle: 'Ваш заказ',
  total: 'Итого',
  pickupLegend: 'Когда заберете',
  payAtCounter: 'Оплата на\u00a0кассе при получении',
  emptyMenu: 'Меню пока пустое',
  orderAccepted: 'Заказ принят',
  orderAcceptedHint: 'Оплата на\u00a0кассе. Напишем в\u00a0чат, когда заказ будет готов.',
  backToMenu: 'Вернуться в\u00a0меню',
  orderConflict: 'Часть позиций закончилась — проверьте заказ',
  orderFailed: 'Не получилось оформить заказ. Попробуйте еще раз',
  add: 'Добавить',
  remove: 'Убрать',
  historyTitle: 'История',
  historyEmpty: 'Здесь появятся штампы и\u00a0купоны. Покажите QR на\u00a0кассе — первый штамп за\u00a0покупку.',
  inviteTitle: 'Пригласить друга',
  inviteHint:
    'Отправьте ссылку другу. Когда он\u00a0впервые откроет приложение по\u00a0ней, вам\u00a0— штамп на\u00a0карту.',
  copyLink: 'Скопировать ссылку',
  linkCopied: 'Ссылка скопирована',
  copyFailed: 'Не получилось скопировать — выделите ссылку и\u00a0скопируйте вручную',
  scannerTitle: 'Сканер',
  scannerHint: 'Попросите гостя открыть карту в\u00a0приложении и\u00a0наведите камеру на\u00a0его QR.',
  scan: 'Сканировать QR',
  scanning: 'Сканер открыт…',
  accrued: '+1 штамп',
  duplicate: 'Этот QR уже отсканирован — штамп не\u00a0добавлен',
  couponIssued: 'Гостю выдан купон: напиток в\u00a0подарок',
  qrNotFound: 'QR не\u00a0найден. Попросите гостя обновить экран карты',
  qrExpired: 'QR устарел. Попросите гостя обновить экран карты',
  notStaff: 'Вас нет в\u00a0списке кассиров. Обратитесь к\u00a0владельцу',
  scanFailed: 'Не получилось начислить штамп. Попробуйте еще раз',
  redeem: 'Погасить купон',
  redeemed: 'Купон погашен',
  redeemConflict: 'Купон уже погашен',
  redeemFailed: 'Не получилось погасить купон. Попробуйте еще раз',
  ordersTitle: 'Заказы',
  ordersEmpty: 'Открытых заказов нет',
  pickupBy: 'к',
  statusConflict: 'Заказ уже изменили — список обновлен',
  statusFailed: 'Не получилось сменить статус. Попробуйте еще раз',
} as const;

export const KEY_STEPS: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };

export const SCAN_ERRORS: Partial<Record<ApiFailureKind, string>> = {
  'not-found': TEXTS.qrNotFound,
  gone: TEXTS.qrExpired,
  forbidden: TEXTS.notStaff,
  unauthorized: TEXTS.unauthorized,
  network: TEXTS.network,
};

export const REDEEM_ERRORS: Partial<Record<ApiFailureKind, string>> = {
  conflict: TEXTS.redeemConflict,
  forbidden: TEXTS.notStaff,
  network: TEXTS.network,
};
