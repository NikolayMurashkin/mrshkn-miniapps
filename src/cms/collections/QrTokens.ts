import type { CollectionConfig } from 'payload';
import { readOnlyAccess } from '../access';
import { DATE_TIME_ADMIN, LOYALTY_GROUP } from '../consts';

/** Одноразовые QR гостей: скан помечает токен использованным одним условным UPDATE. */
export const QrTokens: CollectionConfig = {
  slug: 'qr-tokens',
  labels: { singular: 'QR гостя', plural: 'QR гостей' },
  admin: { group: LOYALTY_GROUP, defaultColumns: ['client', 'expiresAt', 'usedAt'] },
  access: readOnlyAccess,
  defaultSort: '-createdAt',
  fields: [
    { name: 'token', type: 'text', label: 'Токен', required: true, unique: true },
    { name: 'client', type: 'relationship', label: 'Гость', relationTo: 'clients', required: true },
    { name: 'expiresAt', type: 'date', label: 'Действует до', required: true, admin: DATE_TIME_ADMIN },
    { name: 'usedAt', type: 'date', label: 'Отсканирован', admin: DATE_TIME_ADMIN },
  ],
};
