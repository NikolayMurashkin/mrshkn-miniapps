import type { Access } from 'payload';

export const isLoggedIn: Access = ({ req }) => Boolean(req.user);

export const loggedInAccess = {
  read: isLoggedIn,
  create: isLoggedIn,
  update: isLoggedIn,
  delete: isLoggedIn,
};
