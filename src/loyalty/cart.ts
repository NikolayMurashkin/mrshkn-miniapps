import { MAX_QTY } from './consts';
import type { Cart, MenuItem } from './types';

export { MAX_QTY };

export const addToCart = (cart: Cart, id: string): Cart => ({ ...cart, [id]: Math.min((cart[id] ?? 0) + 1, MAX_QTY) });

export const removeFromCart = (cart: Cart, id: string): Cart => {
  const qty = (cart[id] ?? 0) - 1;
  const rest = Object.fromEntries(Object.entries(cart).filter(([key]) => key !== id));

  return qty > 0 ? { ...rest, [id]: qty } : rest;
};

/** Сумма по ценам меню: позиция, которую сняли с меню, в сумму не входит. */
export const cartTotal = (cart: Cart, items: MenuItem[]): number =>
  items.reduce((sum, item) => sum + item.price * (cart[String(item.id)] ?? 0), 0);

export const cartToOrderLines = (cart: Cart): { id: string; qty: number }[] =>
  Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ id, qty }));

/** Корзина без позиций, которых больше нет в меню. */
export const pruneCart = (cart: Cart, items: MenuItem[]): Cart =>
  Object.fromEntries(Object.entries(cart).filter(([id]) => items.some((item) => String(item.id) === id)));
