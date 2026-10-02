import { MINUTE_MS } from './consts';

export type GenerateSlotsInput = {
  date: string;
  timeZone: string;
  workday: { start: string; end: string; breaks: { start: string; end: string }[] } | null;
  durationMin: number;
  stepMin: number;
  busy: { start: Date; end: Date }[];
  now: Date;
};

const zoneOffsetMs = (instant: number, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(instant));
  const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));

  return asUtc - Math.floor(instant / 1000) * 1000;
};

/** Местные дата YYYY-MM-DD и время HH:mm в поясе timeZone -> момент. */
export const zonedToInstant = (date: string, hhmm: string, timeZone: string): Date => {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);
  const wallAsUtc = Date.UTC(year!, month! - 1, day!, hour, minute);
  let instant = wallAsUtc - zoneOffsetMs(wallAsUtc, timeZone);

  instant = wallAsUtc - zoneOffsetMs(instant, timeZone);

  return new Date(instant);
};

export const weekdayOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

export const nextDate = (date: string): string =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + 24 * 60 * MINUTE_MS).toISOString().slice(0, 10);

export const formatLocalTime = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant);

export const formatLocalDate = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('ru-RU', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(instant);

export const generateSlots = (input: GenerateSlotsInput): Date[] => {
  const { date, timeZone, workday, durationMin, stepMin, busy, now } = input;

  if (!workday) {
    return [];
  }

  const dayStart = zonedToInstant(date, workday.start, timeZone).getTime();
  const dayEnd = zonedToInstant(date, workday.end, timeZone).getTime();
  const blocked = [
    ...workday.breaks.map((item) => ({
      start: zonedToInstant(date, item.start, timeZone).getTime(),
      end: zonedToInstant(date, item.end, timeZone).getTime(),
    })),
    ...busy.map((item) => ({ start: item.start.getTime(), end: item.end.getTime() })),
  ];
  const slots: Date[] = [];

  for (let start = dayStart; start + durationMin * MINUTE_MS <= dayEnd; start += stepMin * MINUTE_MS) {
    const end = start + durationMin * MINUTE_MS;

    if (start < now.getTime() || blocked.some((item) => start < item.end && end > item.start)) {
      continue;
    }

    slots.push(new Date(start));
  }

  return slots;
};

export const localDateOf = (instant: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
