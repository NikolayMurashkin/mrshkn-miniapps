import type { CollectionConfig } from 'payload';
import { PLATFORM_OPTIONS } from '../../lib/consts';
import { loggedInAccess } from '../access';
import { assignReferralCode } from '../hooks/client-hooks';

export const Clients: CollectionConfig = {
  slug: 'clients',
  labels: { singular: 'Клиент', plural: 'Клиенты' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'platform', 'platformUserId'] },
  access: loggedInAccess,
  indexes: [{ fields: ['platform', 'platformUserId'], unique: true }],
  hooks: { beforeChange: [assignReferralCode] },
  fields: [
    { name: 'name', type: 'text', label: 'Имя' },
    {
      name: 'platform',
      type: 'select',
      label: 'Платформа',
      required: true,
      options: PLATFORM_OPTIONS,
    },
    { name: 'platformUserId', type: 'text', label: 'ID в мессенджере', required: true },
    {
      name: 'referralCode',
      type: 'text',
      label: 'Реферальный код',
      unique: true,
      admin: { readOnly: true, description: 'Код в ссылке «Пригласить друга».' },
    },
    {
      name: 'referredBy',
      type: 'relationship',
      label: 'Пригласил',
      relationTo: 'clients',
      admin: { readOnly: true },
    },
  ],
};
