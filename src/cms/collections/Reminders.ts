import type { CollectionConfig } from 'payload';
import { loggedInAccess } from '../access';

export const Reminders: CollectionConfig = {
  slug: 'reminders',
  labels: { singular: 'Напоминание', plural: 'Напоминания' },
  admin: { defaultColumns: ['booking', 'kind', 'sendAt', 'status'] },
  access: loggedInAccess,
  defaultSort: 'sendAt',
  fields: [
    { name: 'booking', type: 'relationship', label: 'Запись', relationTo: 'bookings', required: true },
    {
      name: 'kind',
      type: 'select',
      label: 'Вид',
      required: true,
      options: [
        { label: 'За 24 часа', value: '24h' },
        { label: 'За 2 часа', value: '2h' },
      ],
    },
    {
      name: 'sendAt',
      type: 'date',
      label: 'Отправить в',
      required: true,
      index: true,
      admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd.MM.yyyy HH:mm' } },
    },
    {
      name: 'status',
      type: 'select',
      label: 'Статус',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: [
        { label: 'Ожидает', value: 'pending' },
        { label: 'Отправлено', value: 'sent' },
        { label: 'Отменено', value: 'cancelled' },
        { label: 'Не доставлено', value: 'failed' },
      ],
    },
    { name: 'attempts', type: 'number', label: 'Неудачных попыток', required: true, defaultValue: 0, min: 0 },
  ],
};
