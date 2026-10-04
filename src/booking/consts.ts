import { DEFAULT_TIME_ZONE } from '@/lib/consts';
import type { Step } from './types';

export { DEFAULT_TIME_ZONE };

export const API_BASE = '/api/miniapp';
export const DATES_IN_STRIP = 14;
export const DATE_PARTS = /^(\d{4})-(\d{2})-(\d{2})$/;
export const DAY_MS = 86_400_000;
export const LOCALE = 'ru-RU';
export const MAIN_BUTTON_TEXT = 'Записаться';

export const STEP_TITLES: Record<Step, string> = {
  service: 'Выберите услугу',
  master: 'Выберите мастера',
  time: 'Выберите время',
  review: 'Проверьте запись',
};

export const PREVIOUS_STEP: Partial<Record<Step, Step>> = { master: 'service', time: 'master', review: 'time' };

export const TEXTS = {
  loading: 'Загрузка…',
  unauthorized: 'Откройте запись из чата с ботом',
  noServices: 'Пока нет услуг для записи',
  noMasters: 'Для\u00a0этой услуги пока нет мастеров',
  noSlots: 'На этот день свободного времени нет',
  conflict: 'Это время уже заняли — выберите другое',
  network: 'Не получилось загрузить. Проверьте интернет',
  loadFailed: 'Не получилось загрузить. Попробуйте еще раз',
  bookingFailed: 'Не получилось записаться. Попробуйте еще раз',
  retry: 'Повторить',
  back: 'Назад',
  done: 'Вы записаны',
  timeZoneNote: 'Время — по местному времени салона',
  minutes: 'мин',
  service: 'Услуга',
  master: 'Мастер',
  when: 'Время',
} as const;
