import type { CollectionConfig } from 'payload';
import { PLATFORM_OPTIONS } from '../../lib/consts';
import { readOnlyAccess } from '../access';
import { DATE_TIME_ADMIN, MENU_GROUP, ORDER_STATUS_OPTIONS, PICKUP_SELECT_OPTIONS } from '../consts';

/** Статус ведет кассир в Mini App: там граф переходов и сообщение гостю о готовности, поэтому в админке — чтение. */
export const Orders: CollectionConfig = {
  slug: 'orders',
  labels: { singular: 'Предзаказ', plural: 'Предзаказы' },
  admin: { group: MENU_GROUP, defaultColumns: ['id', 'client', 'total', 'pickup', 'status', 'createdAt'] },
  access: readOnlyAccess,
  defaultSort: '-createdAt',
  fields: [
    { name: 'client', type: 'relationship', label: 'Гость', relationTo: 'clients', required: true },
    { name: 'platform', type: 'select', label: 'Платформа', required: true, options: PLATFORM_OPTIONS },
    {
      name: 'items',
      type: 'array',
      label: 'Позиции',
      required: true,
      minRows: 1,
      fields: [
        { name: 'menuItem', type: 'relationship', label: 'Позиция меню', relationTo: 'menu-items' },
        { name: 'name', type: 'text', label: 'Название', required: true },
        { name: 'price', type: 'number', label: 'Цена, ₽', required: true },
        { name: 'qty', type: 'number', label: 'Количество', required: true },
      ],
    },
    { name: 'total', type: 'number', label: 'Сумма, ₽', required: true },
    { name: 'pickup', type: 'select', label: 'Выдача', required: true, options: PICKUP_SELECT_OPTIONS },
    { name: 'pickupAt', type: 'date', label: 'Выдать к', admin: DATE_TIME_ADMIN },
    {
      name: 'status',
      type: 'select',
      label: 'Статус',
      required: true,
      defaultValue: 'new',
      index: true,
      options: ORDER_STATUS_OPTIONS,
    },
  ],
};
