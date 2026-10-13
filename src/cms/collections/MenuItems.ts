import type { CollectionConfig } from 'payload';
import { loggedInAccess } from '../access';
import { MENU_CATEGORY_OPTIONS, MENU_GROUP } from '../consts';

const wholeRubles = (value: number | null | undefined): true | string =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 ? true : 'Цена — целое число рублей от 1';

export const MenuItems: CollectionConfig = {
  slug: 'menu-items',
  labels: { singular: 'Позиция меню', plural: 'Меню' },
  admin: { group: MENU_GROUP, useAsTitle: 'name', defaultColumns: ['name', 'category', 'price', 'available'] },
  access: loggedInAccess,
  defaultSort: 'category',
  fields: [
    { name: 'name', type: 'text', label: 'Название', required: true },
    { name: 'description', type: 'text', label: 'Описание' },
    { name: 'price', type: 'number', label: 'Цена, ₽', required: true, min: 1, validate: wholeRubles },
    { name: 'category', type: 'select', label: 'Раздел', required: true, options: MENU_CATEGORY_OPTIONS },
    {
      name: 'available',
      type: 'checkbox',
      label: 'В наличии',
      defaultValue: true,
      admin: { description: 'Снятая позиция пропадает из меню Mini App.' },
    },
  ],
};
