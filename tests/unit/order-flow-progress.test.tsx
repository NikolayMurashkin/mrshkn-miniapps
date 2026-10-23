// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bridge } from '@/bridge/types';
import { useOrderFlow } from '@/loyalty/useOrderFlow';

const MENU = {
  items: [{ id: 'latte', name: 'Латте', description: 'Двойной эспрессо и молоко', price: 250, category: 'coffee' }],
};
const ORDERS_PATH = '/api/miniapp/orders';
const ORDER_BUTTON_TEXT = 'Оформить заказ';

type OrderPost = () => Response | Promise<Response>;
type OrderFlow = ReturnType<typeof useOrderFlow>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const placed = () => json({ id: 77, status: 'new', total: 250 }, 201);

/** Мок fetch: меню из одной позиции, заказов гостя нет, POST заказа — ответ сценария. */
const createApi = (post: OrderPost = placed) => {
  const calls: { path: string; method: string }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://app.test',
    );
    const method = (init?.method ?? 'GET').toUpperCase();

    calls.push({ path: url.pathname, method });

    if (url.pathname === '/api/miniapp/menu') {
      return json(MENU);
    }

    if (url.pathname === ORDERS_PATH) {
      return method === 'POST' ? post() : json({ orders: [] });
    }

    return json({ error: 'not found' }, 404);
  });

  vi.stubGlobal('fetch', fetchMock);

  return { posts: () => calls.filter((call) => call.path === ORDERS_PATH && call.method === 'POST') };
};

/**
 * Подставной bridge: журнал вызовов главной кнопки; press — только видимая и активная, как на платформе.
 * forcePress — нажатие, которое платформа доставила, хотя кнопка выключена: проверяет защиту самого потока.
 */
const createFakeBridge = () => {
  const handlers = new Set<() => void>();
  const state = { visible: false, enabled: true, progress: false, text: '', log: [] as string[] };
  const bridge: Bridge = {
    platform: 'telegram',
    initData: 'query_id=order-query&user=%7B%22id%22%3A4242%7D&auth_date=1900000000&hash=orderhash',
    theme: {
      scheme: 'light',
      colors: {
        bg: '#ffffff',
        text: '#000000',
        hint: '#999999',
        link: '#2678b6',
        button: '#50a8eb',
        buttonText: '#ffffff',
        secondaryBg: '#efeff3',
      },
    },
    scanQr: async () => null,
    mainButton: {
      setText: (text) => {
        state.text = text;
        state.log.push(`setText:${text}`);
      },
      show: () => {
        state.visible = true;
        state.log.push('show');
      },
      hide: () => {
        state.visible = false;
        state.log.push('hide');
      },
      enable: () => {
        state.enabled = true;
        state.log.push('enable');
      },
      disable: () => {
        state.enabled = false;
        state.log.push('disable');
      },
      showProgress: () => {
        state.progress = true;
        state.log.push('showProgress');
      },
      hideProgress: () => {
        state.progress = false;
        state.log.push('hideProgress');
      },
      onClick: (handler) => {
        handlers.add(handler);

        return () => {
          handlers.delete(handler);
        };
      },
    },
  };
  const press = () => {
    if (state.visible && state.enabled) {
      [...handlers].forEach((handler) => handler());
    }
  };
  const forcePress = () => [...handlers].forEach((handler) => handler());

  return { bridge, state, press, forcePress };
};

/** Запись later в журнале кнопки стоит после последней earlier; earlier в журнале есть. */
const expectLoggedAfter = (log: string[], earlier: string, later: string) => {
  expect(log).toContain(earlier);
  expect(log.lastIndexOf(later), `«${later}» после «${earlier}»: ${log.join(', ')}`).toBeGreaterThan(
    log.lastIndexOf(earlier),
  );
};

/** Ждет состояния потока и прогоняет эффекты перерисовки: главная кнопка получает вызовы и из них. */
const settle = async (check: () => void) => {
  await waitFor(check);
  await act(async () => {});
};

/** Меню загружено, в корзине латте, главная кнопка видна с текстом заказа. */
const openMenu = async (post?: OrderPost) => {
  const api = createApi(post);
  const fake = createFakeBridge();
  const { result } = renderHook(() => useOrderFlow(fake.bridge, true));

  await waitFor(() => expect(result.current.status).toBe('ready'));
  act(() => result.current.add('latte'));

  expect(fake.state.visible).toBe(true);
  expect(fake.state.text).toBe(ORDER_BUTTON_TEXT);

  return { api, fake, result };
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('O: индикатор отправки предзаказа на главной кнопке', () => {
  it('O1: индикатор до ответа и после перерисовки, один POST, снят на успехе', async () => {
    let release: (response: Response) => void = () => {};
    const { api, fake, result } = await openMenu(() => new Promise<Response>((resolve) => (release = resolve)));

    act(() => fake.press());
    await act(async () => {});

    expect(result.current.submitStatus).toBe('sending');
    expect(fake.state.progress).toBe(true);
    expect(fake.state.log.filter((entry) => entry === 'showProgress' || entry === 'hideProgress').at(-1)).toBe(
      'showProgress',
    );
    expect(api.posts()).toHaveLength(1);

    act(() => fake.forcePress());
    expect(api.posts()).toHaveLength(1);

    await act(async () => release(placed()));
    await settle(() => expect(result.current.submitStatus).toBe('done'));

    expect(fake.state.progress).toBe(false);
    expectLoggedAfter(fake.state.log, 'showProgress', 'hideProgress');
  });

  it.each<[string, OrderPost, 'failed' | 'network']>([
    ['500', () => json({ error: 'boom' }, 500), 'failed'],
    ['сеть', () => Promise.reject(new TypeError('Failed to fetch')), 'network'],
  ])('O2 %s: ошибка снимает индикатор, кнопка снова нажимается', async (_label, post, expected) => {
    const { api, fake, result } = await openMenu(post);

    act(() => fake.press());
    await settle(() => expect(result.current.submitStatus).toBe(expected));

    expect(fake.state.progress).toBe(false);
    expect(fake.state.enabled).toBe(true);
    expectLoggedAfter(fake.state.log, 'showProgress', 'hideProgress');
    expectLoggedAfter(fake.state.log, 'showProgress', 'enable');

    act(() => fake.press());

    expect(api.posts()).toHaveLength(2);
    await settle(() => expect(result.current.submitStatus).toBe(expected));
  });

  it.each<[number, (flow: OrderFlow) => string, string]>([
    [409, (flow) => flow.submitStatus, 'conflict'],
    [401, (flow) => flow.status, 'unauthorized'],
  ])('O3 %i: 409 и 401 снимают индикатор', async (code, pick, expected) => {
    const { fake, result } = await openMenu(() => json({ error: 'rejected' }, code));

    act(() => fake.press());
    await settle(() => expect(pick(result.current)).toBe(expected));

    expect(fake.state.progress).toBe(false);
    expectLoggedAfter(fake.state.log, 'showProgress', 'hideProgress');
  });
});
