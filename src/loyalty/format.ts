import { LOCALE } from './consts';

const money = new Intl.NumberFormat(LOCALE);

export const formatPrice = (rubles: number): string => `${money.format(rubles)} ₽`;

/** Время выдачи — в поясе бизнеса, как в сообщении владельцу. */
export const formatTime = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat(LOCALE, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(iso),
  );

/** История гостя — на его устройстве: гость в кофейне, пояс один. */
export const formatMoment = (iso: string): string =>
  new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));

/** Форма слова для числа: 1 штамп, 2 штампа, 5 штампов. */
export const plural = (count: number, [one, few, many]: [string, string, string]): string => {
  const tens = count % 100;
  const units = count % 10;

  if (tens >= 11 && tens <= 14) {
    return many;
  }

  if (units === 1) {
    return one;
  }

  return units >= 2 && units <= 4 ? few : many;
};
