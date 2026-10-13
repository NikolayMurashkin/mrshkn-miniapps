import type { Access } from 'payload';

export const isLoggedIn: Access = ({ req }) => Boolean(req.user);

export const loggedInAccess = {
  read: isLoggedIn,
  create: isLoggedIn,
  update: isLoggedIn,
  delete: isLoggedIn,
};

const nobody: Access = () => false;

/** Журнал пишет только сервер: в админке его читают, но не правят и не удаляют. */
export const readOnlyAccess = {
  read: isLoggedIn,
  create: nobody,
  update: nobody,
  delete: nobody,
};
