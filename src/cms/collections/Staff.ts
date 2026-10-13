import type { CollectionConfig } from 'payload';
import { PLATFORM_OPTIONS } from '../../lib/consts';
import { loggedInAccess } from '../access';
import { LOYALTY_GROUP } from '../consts';

export const Staff: CollectionConfig = {
  slug: 'staff',
  labels: { singular: 'Кассир', plural: 'Кассиры' },
  admin: {
    group: LOYALTY_GROUP,
    useAsTitle: 'name',
    defaultColumns: ['name', 'platform', 'platformUserId', 'active'],
    description: 'Кто сканирует QR гостей и ведет предзаказы в Mini App.',
  },
  access: loggedInAccess,
  indexes: [{ fields: ['platform', 'platformUserId'], unique: true }],
  fields: [
    { name: 'name', type: 'text', label: 'Имя', required: true },
    { name: 'platform', type: 'select', label: 'Платформа', required: true, options: PLATFORM_OPTIONS },
    {
      name: 'platformUserId',
      type: 'text',
      label: 'ID в мессенджере',
      required: true,
      admin: { description: 'Числовой ID пользователя Telegram или MAX.' },
    },
    { name: 'active', type: 'checkbox', label: 'Работает', defaultValue: true },
  ],
};
