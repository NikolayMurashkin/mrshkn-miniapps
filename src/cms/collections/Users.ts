import type { CollectionConfig } from 'payload';
import { loggedInAccess } from '../access';

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Пользователь', plural: 'Пользователи' },
  admin: { useAsTitle: 'email' },
  auth: true,
  access: loggedInAccess,
  fields: [],
};
