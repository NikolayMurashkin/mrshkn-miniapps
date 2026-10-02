import type { CollectionConfig, TextFieldSingleValidation } from 'payload';
import { TIME_PATTERN } from '../../lib/consts';
import { loggedInAccess } from '../access';

const validateTime: TextFieldSingleValidation = (value) =>
  typeof value === 'string' && TIME_PATTERN.test(value) ? true : 'Время в формате ЧЧ:ММ';

export const Masters: CollectionConfig = {
  slug: 'masters',
  labels: { singular: 'Мастер', plural: 'Мастера' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'services'] },
  access: loggedInAccess,
  fields: [
    { name: 'name', type: 'text', label: 'Имя', required: true },
    {
      name: 'services',
      type: 'relationship',
      label: 'Услуги',
      relationTo: 'services',
      hasMany: true,
      required: true,
    },
    {
      name: 'schedule',
      type: 'array',
      label: 'Расписание',
      labels: { singular: 'День', plural: 'Дни недели' },
      admin: { description: 'Дня нет в списке — выходной.' },
      fields: [
        {
          name: 'weekday',
          type: 'number',
          label: 'День недели (0 — воскресенье, 1 — понедельник, … 6 — суббота)',
          required: true,
          min: 0,
          max: 6,
        },
        { name: 'start', type: 'text', label: 'Начало', required: true, validate: validateTime },
        { name: 'end', type: 'text', label: 'Конец', required: true, validate: validateTime },
        {
          name: 'breaks',
          type: 'array',
          label: 'Перерывы',
          labels: { singular: 'Перерыв', plural: 'Перерывы' },
          fields: [
            { name: 'start', type: 'text', label: 'Начало', required: true, validate: validateTime },
            { name: 'end', type: 'text', label: 'Конец', required: true, validate: validateTime },
          ],
        },
      ],
    },
  ],
};
