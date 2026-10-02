import { describe, expect, it } from 'vitest';
import { generateSlots, type GenerateSlotsInput } from '@/lib/slots';

// Europe/Kaliningrad = UTC+2 круглый год.
const DATE = '2030-03-12';
const TIME_ZONE = 'Europe/Kaliningrad';
const EVE = new Date('2030-03-11T10:00:00.000Z');

/** Местное время дня DATE (UTC+2) как момент. */
const at = (hhmm: string): Date => new Date(`${DATE}T${hhmm}:00+02:00`);
const iso = (slots: Date[]): string[] => slots.map((slot) => slot.toISOString());
const isoOf = (...times: string[]): string[] => times.map((time) => at(time).toISOString());

const base: GenerateSlotsInput = {
  date: DATE,
  timeZone: TIME_ZONE,
  workday: { start: '10:00', end: '18:00', breaks: [] },
  durationMin: 60,
  stepMin: 30,
  busy: [],
  now: EVE,
};

describe('generateSlots', () => {
  it('2.1 день 10:00-18:00, услуга 60: первый 10:00, последний 17:00, 15 слотов', () => {
    const slots = generateSlots(base);

    expect(slots).toHaveLength(15);
    expect(slots[0]?.toISOString()).toBe(at('10:00').toISOString());
    expect(slots.at(-1)?.toISOString()).toBe(at('17:00').toISOString());
  });

  it('2.2 услуга 90: последний 16:30, слот не выходит за конец дня', () => {
    const slots = generateSlots({ ...base, durationMin: 90 });

    expect(slots.at(-1)?.toISOString()).toBe(at('16:30').toISOString());
    expect(slots).toHaveLength(14);
  });

  it('2.3 перерыв 13:00-14:00, услуга 60: нет 12:30, 13:00, 13:30; есть 12:00 и 14:00', () => {
    const slots = iso(
      generateSlots({ ...base, workday: { start: '10:00', end: '18:00', breaks: [{ start: '13:00', end: '14:00' }] } }),
    );

    expect(slots).not.toContain(at('12:30').toISOString());
    expect(slots).not.toContain(at('13:00').toISOString());
    expect(slots).not.toContain(at('13:30').toISOString());
    expect(slots).toContain(at('12:00').toISOString());
    expect(slots).toContain(at('14:00').toISOString());
  });

  it('2.4 занято 11:00-12:00, услуга 60: нет 10:30, 11:00, 11:30; есть 10:00 и 12:00', () => {
    const slots = iso(generateSlots({ ...base, busy: [{ start: at('11:00'), end: at('12:00') }] }));

    expect(slots).not.toContain(at('10:30').toISOString());
    expect(slots).not.toContain(at('11:00').toISOString());
    expect(slots).not.toContain(at('11:30').toISOString());
    expect(slots).toContain(at('10:00').toISOString());
    expect(slots).toContain(at('12:00').toISOString());
  });

  it('2.5 workday null (выходной): пустой список', () => {
    expect(generateSlots({ ...base, workday: null })).toEqual([]);
  });

  it('2.6 now - сегодня 12:10: слотов раньше 12:30 нет', () => {
    const slots = iso(generateSlots({ ...base, now: at('12:10') }));

    expect(slots[0]).toBe(at('12:30').toISOString());
    expect(slots.at(-1)).toBe(at('17:00').toISOString());
    expect(slots).toHaveLength(10);
  });

  it('2.7 пояс Europe/Kaliningrad: 10:00 местного = 08:00Z', () => {
    expect(generateSlots(base)[0]?.toISOString()).toBe('2030-03-12T08:00:00.000Z');
  });

  it('2.8 шаг 15: слоты 10:00, 10:15, ...', () => {
    const slots = iso(generateSlots({ ...base, stepMin: 15 }));

    expect(slots.slice(0, 4)).toEqual(isoOf('10:00', '10:15', '10:30', '10:45'));
    expect(slots.at(-1)).toBe(at('17:00').toISOString());
    expect(slots).toHaveLength(29);
  });
});
