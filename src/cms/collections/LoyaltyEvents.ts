import type { CollectionConfig } from 'payload';
import { readOnlyAccess } from '../access';
import { DATE_TIME_ADMIN, LOYALTY_EVENT_OPTIONS, LOYALTY_GROUP } from '../consts';

/** Журнал лояльности: штампы на карте считаются по нему, отдельного счетчика у клиента нет. */
export const LoyaltyEvents: CollectionConfig = {
  slug: 'loyalty-events',
  labels: { singular: 'Событие лояльности', plural: 'Журнал лояльности' },
  admin: { group: LOYALTY_GROUP, defaultColumns: ['client', 'type', 'at', 'staff'] },
  access: readOnlyAccess,
  defaultSort: '-at',
  fields: [
    { name: 'client', type: 'relationship', label: 'Гость', relationTo: 'clients', required: true, index: true },
    { name: 'type', type: 'select', label: 'Событие', required: true, options: LOYALTY_EVENT_OPTIONS },
    { name: 'at', type: 'date', label: 'Когда', required: true, admin: DATE_TIME_ADMIN },
    { name: 'staff', type: 'relationship', label: 'Кассир', relationTo: 'staff' },
  ],
};
