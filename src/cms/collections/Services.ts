import type { CollectionConfig } from 'payload';
import { loggedInAccess } from '../access';

export const Services: CollectionConfig = {
  slug: 'services',
  labels: { singular: 'Услуга', plural: 'Услуги' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'durationMin', 'priceFrom'] },
  access: loggedInAccess,
  fields: [
    { name: 'name', type: 'text', label: 'Название', required: true },
    { name: 'durationMin', type: 'number', label: 'Длительность, мин', required: true, min: 5, max: 600 },
    { name: 'priceFrom', type: 'number', label: 'Цена от, ₽', min: 0 },
  ],
};
