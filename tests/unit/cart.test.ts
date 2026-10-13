import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(import.meta.dirname, '../../src');

/** Модуля еще нет — тест падает на assert «нет src/…», а не на сборке файла. */
const importSrc = async <T>(relative: string): Promise<T> => {
  const file = path.join(SRC, relative);

  expect(existsSync(file), `нет src/${relative}`).toBe(true);

  return (await import(/* @vite-ignore */ file)) as T;
};

type Cart = Record<string, number>;
type MenuItem = { id: string; name: string; description: string; price: number; category: string };
type CartModule = {
  MAX_QTY: number;
  addToCart(cart: Cart, id: string): Cart;
  removeFromCart(cart: Cart, id: string): Cart;
  cartTotal(cart: Cart, items: MenuItem[]): number;
  cartToOrderLines(cart: Cart): { id: string; qty: number }[];
  pruneCart(cart: Cart, items: MenuItem[]): Cart;
};

const ITEMS: MenuItem[] = [
  { id: '11', name: 'Капучино', description: '250 мл', price: 260, category: 'coffee' },
  { id: '12', name: 'Круассан', description: 'на сливочном масле', price: 190, category: 'bakery' },
];

describe('корзина предзаказа', () => {
  it('C1 добавление до MAX_QTY, удаление до 0, сумма по ценам меню, строки заказа, вход не мутируется', async () => {
    const { MAX_QTY, addToCart, removeFromCart, cartTotal, cartToOrderLines } =
      await importSrc<CartModule>('loyalty/cart.ts');

    expect(MAX_QTY).toBe(20);

    const empty: Cart = {};
    const once = addToCart(empty, '11');
    const twice = addToCart(once, '11');

    expect(twice).toEqual({ '11': 2 });
    expect(empty).toEqual({});
    expect(once).toEqual({ '11': 1 });

    let full: Cart = {};

    for (let i = 0; i < MAX_QTY + 5; i += 1) {
      full = addToCart(full, '11');
    }

    expect(full).toEqual({ '11': MAX_QTY });

    const withCroissant = addToCart(twice, '12');
    const lessCoffee = removeFromCart(withCroissant, '11');

    expect(lessCoffee).toEqual({ '11': 1, '12': 1 });
    expect(withCroissant).toEqual({ '11': 2, '12': 1 });

    const noCroissant = removeFromCart(lessCoffee, '12');

    expect(noCroissant).toEqual({ '11': 1 });
    expect(Object.keys(noCroissant)).not.toContain('12');

    const order: Cart = { '11': 2, '12': 1 };
    const withRemoved: Cart = { '11': 2, '12': 1, '99': 3 };
    const snapshot = { ...withRemoved };

    expect(cartTotal(order, ITEMS)).toBe(710);
    // позицию 99 сняли с меню: в сумму она не входит
    expect(cartTotal(withRemoved, ITEMS)).toBe(710);
    expect(withRemoved).toEqual(snapshot);

    const lines = cartToOrderLines({ '11': 2, '12': 1, '13': 0 });

    expect([...lines].sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: '11', qty: 2 },
      { id: '12', qty: 1 },
    ]);
  });

  it('C2 pruneCart: позиции, снятой с меню, в корзине больше нет; остальные с прежним количеством; вход не мутируется', async () => {
    const { pruneCart } = await importSrc<CartModule>('loyalty/cart.ts');
    const cart: Cart = { '11': 2, '12': 1, '99': 3 };
    const snapshot = { ...cart };

    expect(pruneCart(cart, ITEMS)).toEqual({ '11': 2, '12': 1 });
    expect(pruneCart(cart, [ITEMS[0]!])).toEqual({ '11': 2 });
    expect(pruneCart(cart, [])).toEqual({});
    expect(cart).toEqual(snapshot);
  });
});
