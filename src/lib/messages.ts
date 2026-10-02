import { formatLocalDate, formatLocalTime } from './slots';
import type { BookingChange, BookingText } from './types';

const when = ({ startAt, timeZone }: BookingText): string =>
  `${formatLocalDate(startAt, timeZone)} в ${formatLocalTime(startAt, timeZone)}`;

const details = (booking: BookingText): string =>
  `Услуга: ${booking.serviceName}\nМастер: ${booking.masterName}\nВремя: ${when(booking)}`;

export const ownerNewBookingText = (booking: BookingText, clientLabel: string, platformLabel: string): string =>
  `Новая запись\n${details(booking)}\nКлиент: ${clientLabel} (${platformLabel})`;

export const clientConfirmationText = (booking: BookingText): string => `Вы записаны.\n${details(booking)}`;

export const clientRescheduleText = (booking: BookingText): string => `Запись перенесена.\n${details(booking)}`;

export const clientCancellationText = (booking: BookingText): string => `Запись отменена.\n${details(booking)}`;

/** Сообщение клиенту о правке записи админом. */
export const clientChangeText = (change: BookingChange, booking: BookingText): string => {
  switch (change) {
    case 'created':
      return clientConfirmationText(booking);
    case 'moved':
      return clientRescheduleText(booking);
    case 'cancelled':
      return clientCancellationText(booking);
  }
};

export const reminderText = (booking: BookingText): string => `Напоминаем о записи.\n${details(booking)}`;
