import { DATE_PARTS, DAY_MS, LOCALE, DATES_IN_STRIP } from './consts';
import type { DayItem } from './types';

const utcOf = (date: string): number => {
  const match = DATE_PARTS.exec(date);

  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : Number.NaN;
};

/** Сегодняшняя дата `YYYY-MM-DD` в поясе бизнеса. */
export const todayIn = (timeZone: string, now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export const buildDays = (today: string, count: number = DATES_IN_STRIP): DayItem[] => {
  const start = utcOf(today);
  const weekday = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', weekday: 'short' });
  const day = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', day: 'numeric' });

  return Array.from({ length: count }, (_, index) => {
    const moment = new Date(start + index * DAY_MS);

    return {
      date: moment.toISOString().slice(0, 10),
      weekday: weekday.format(moment),
      day: day.format(moment),
    };
  });
};

export const formatTime = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat(LOCALE, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(iso),
  );

export const formatMoment = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
