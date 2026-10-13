import type { CollectionConfig } from 'payload';
import { readOnlyAccess } from '../access';
import { COUPON_STATUS_OPTIONS, DATE_TIME_ADMIN, LOYALTY_GROUP } from '../consts';

/** Купон «напиток в подарок» за каждый десятый штамп; гасит кассир в Mini App. */
export const Coupons: CollectionConfig = {
  slug: 'coupons',
  labels: { singular: 'Купон', plural: 'Купоны' },
  admin: { group: LOYALTY_GROUP, defaultColumns: ['client', 'status', 'issuedAt', 'redeemedAt'] },
  access: readOnlyAccess,
  defaultSort: '-issuedAt',
  fields: [
    { name: 'client', type: 'relationship', label: 'Гость', relationTo: 'clients', required: true, index: true },
    {
      name: 'status',
      type: 'select',
      label: 'Статус',
      required: true,
      defaultValue: 'active',
      options: COUPON_STATUS_OPTIONS,
    },
    { name: 'issuedAt', type: 'date', label: 'Выдан', required: true, admin: DATE_TIME_ADMIN },
    { name: 'redeemedAt', type: 'date', label: 'Погашен', admin: DATE_TIME_ADMIN },
    { name: 'redeemedBy', type: 'relationship', label: 'Погасил', relationTo: 'staff' },
  ],
};
