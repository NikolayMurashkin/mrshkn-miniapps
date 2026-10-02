import type { CollectionConfig } from 'payload';
import { PLATFORM_OPTIONS } from '../../lib/consts';
import { loggedInAccess } from '../access';
import { bookingAfterChange, bookingBeforeValidate, rejectBulkUpdate } from '../hooks/booking-hooks';

/** Поле заполняет хук до валидации на сервере; форма админки его не вводит, пустое значение там допустимо. */
const computedOnServer = (): true => true;

export const Bookings: CollectionConfig = {
  slug: 'bookings',
  labels: { singular: 'Запись', plural: 'Записи' },
  admin: { defaultColumns: ['service', 'master', 'startAt', 'platform', 'status'] },
  access: { ...loggedInAccess, delete: () => false },
  defaultSort: '-startAt',
  disableBulkEdit: true,
  hooks: {
    beforeOperation: [rejectBulkUpdate],
    beforeValidate: [bookingBeforeValidate],
    afterChange: [bookingAfterChange],
  },
  fields: [
    { name: 'service', type: 'relationship', label: 'Услуга', relationTo: 'services', required: true },
    { name: 'master', type: 'relationship', label: 'Мастер', relationTo: 'masters', required: true },
    {
      name: 'client',
      type: 'relationship',
      label: 'Клиент',
      relationTo: 'clients',
      required: true,
      access: { update: ({ id }) => !id },
    },
    {
      name: 'startAt',
      type: 'date',
      label: 'Время',
      required: true,
      index: true,
      admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd.MM.yyyy HH:mm' } },
    },
    {
      name: 'endAt',
      type: 'date',
      label: 'Окончание',
      required: true,
      validate: computedOnServer,
      admin: {
        readOnly: true,
        description: 'Считается по длительности услуги.',
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd.MM.yyyy HH:mm' },
      },
    },
    {
      name: 'platform',
      type: 'select',
      label: 'Платформа',
      required: true,
      validate: computedOnServer,
      admin: { readOnly: true, description: 'Берется у клиента.' },
      options: PLATFORM_OPTIONS,
    },
    {
      name: 'status',
      type: 'select',
      label: 'Статус',
      required: true,
      defaultValue: 'active',
      options: [
        { label: 'Активна', value: 'active' },
        { label: 'Отменена', value: 'cancelled' },
      ],
    },
    {
      name: 'crmStatus',
      type: 'select',
      label: 'Передача в CRM',
      required: true,
      admin: { readOnly: true },
      defaultValue: 'pending',
      options: [
        { label: 'Ожидает', value: 'pending' },
        { label: 'Передана', value: 'sent' },
        { label: 'Ошибка', value: 'failed' },
        { label: 'Не требуется', value: 'skipped' },
      ],
    },
    {
      name: 'crmEvent',
      type: 'select',
      label: 'Событие для CRM',
      required: true,
      admin: { readOnly: true },
      defaultValue: 'booking.created',
      options: [
        { label: 'Создана', value: 'booking.created' },
        { label: 'Изменена', value: 'booking.updated' },
        { label: 'Отменена', value: 'booking.cancelled' },
      ],
    },
    {
      name: 'crmAttempts',
      type: 'number',
      label: 'Попыток передачи в CRM',
      required: true,
      defaultValue: 0,
      min: 0,
      admin: { readOnly: true },
    },
  ],
};
