// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bridge } from '@/bridge/types';
import { LoyaltyApp } from '@/loyalty/LoyaltyApp';

const DEMO_NOTE = 'Демо-проект студии MRSHKN';
/** Пробелы в подписи могут быть неразрывными: сравнение — по тексту с обычными пробелами. */
const plainText = (node: Element | null | undefined): string => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

const GUEST_ME = {
  role: 'guest',
  stamps: 3,
  stampsPerCoupon: 10,
  coupons: [],
  referralLink: 'https://t.me/coffee_test_bot?startapp=ref_abc123',
};
const STAFF_ME = { role: 'staff', name: 'Вера' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Мок fetch по адресу: /loyalty/me — ответ сценария, остальные экраны — пустые списки. */
const mockApi = (me: Record<string, unknown>) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://app.test',
    );

    switch (url.pathname) {
      case '/api/miniapp/loyalty/me':
        return json(me);
      case '/api/miniapp/loyalty/qr':
        return json({ qrToken: 'qr-demo-token', expiresAt: '2099-01-01T00:00:00.000Z' }, 201);
      case '/api/miniapp/loyalty/history':
        return json({ events: [] });
      case '/api/miniapp/menu':
        return json({ items: [] });
      case '/api/miniapp/orders':
        return json({ orders: [] });
      case '/api/miniapp/staff/orders':
        return json({ orders: [], timeZone: 'Europe/Kaliningrad' });
      default:
        return json({ error: 'not found' }, 404);
    }
  });

  vi.stubGlobal('fetch', fetchMock);
};

const fakeBridge = (): Bridge => ({
  platform: 'telegram',
  initData: 'query_id=demo-query&user=%7B%22id%22%3A4242%7D&auth_date=1900000000&hash=demohash',
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
  mainButton: {
    setText: () => {},
    show: () => {},
    hide: () => {},
    enable: () => {},
    disable: () => {},
    showProgress: () => {},
    hideProgress: () => {},
    onClick: () => () => {},
  },
  scanQr: async () => null,
});

/** Экран готов, когда видны вкладки роли: гостю — «Карта», кассиру — «Сканер». */
const renderApp = async (me: Record<string, unknown>) => {
  mockApi(me);
  render(<LoyaltyApp bridge={fakeBridge()} />);
  await screen.findByRole('tab', { name: me.role === 'staff' ? 'Сканер' : 'Карта' });

  const main = document.querySelector('main');

  expect(main, 'нет <main>').not.toBeNull();

  return main as HTMLElement;
};

/** Подпись одна, она — последний элемент main, все панели вкладок стоят до нее. */
const expectNoteLast = (main: HTMLElement) => {
  const notes = screen.queryAllByText(DEMO_NOTE);

  expect(notes, 'строк «Демо-проект студии MRSHKN» на экране').toHaveLength(1);
  expect(plainText(main.lastElementChild)).toBe(DEMO_NOTE);
  expect(main.lastElementChild?.contains(notes[0]!)).toBe(true);

  const panels = Array.from(main.querySelectorAll('[role="tabpanel"]'));

  expect(panels.length).toBeGreaterThan(0);
  panels.forEach((panel) => {
    expect(main.lastElementChild?.contains(panel)).toBe(false);
    expect(panel.compareDocumentPosition(notes[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('подпись демо-экземпляра на экранах «Лояльности»', () => {
  it('N1 гость, demo: true — одна строка «Демо-проект студии MRSHKN», последний элемент main после вкладок', async () => {
    const main = await renderApp({ ...GUEST_ME, demo: true });

    expectNoteLast(main);
  });

  it('N2 кассир, demo: true — одна строка, последний элемент main после вкладок', async () => {
    const main = await renderApp({ ...STAFF_ME, demo: true });

    expectNoteLast(main);
  });

  it('N3 гость и кассир с demo: false и без поля demo — строки нет', async () => {
    const cases = [{ ...GUEST_ME, demo: false }, { ...GUEST_ME }, { ...STAFF_ME, demo: false }, { ...STAFF_ME }];

    for (const me of cases) {
      await renderApp(me);
      expect(screen.queryByText(DEMO_NOTE), `me: ${JSON.stringify(me)}`).toBeNull();
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  it('N4 гость, demo: true, переключил вкладку «Меню» — подпись на месте', async () => {
    const main = await renderApp({ ...GUEST_ME, demo: true });

    await userEvent.setup().click(screen.getByRole('tab', { name: 'Меню' }));
    await screen.findByText('Меню пока пустое');

    expect(screen.getByRole('tab', { name: 'Меню' }).getAttribute('aria-selected')).toBe('true');
    expectNoteLast(main);
  });
});
