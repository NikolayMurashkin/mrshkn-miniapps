// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingFlow } from '@/booking/BookingFlow';
import type { Bridge, BridgePlatform } from '@/bridge/types';

const SERVICES = [
  { id: 1, name: 'Женская стрижка', durationMin: 60 },
  { id: 2, name: 'Мужская стрижка', durationMin: 30 },
];
const MASTERS = [
  { id: 10, name: 'Алина Ветрова', services: [1, 2] },
  { id: 11, name: 'Игорь Лесной', services: [2] },
];
const CATALOG = { services: SERVICES, masters: MASTERS };
const TITLES = ['Выберите услугу', 'Выберите мастера', 'Выберите время', 'Проверьте запись'];
const SLOT_TIMES = ['T08:00:00.000Z', 'T08:30:00.000Z', 'T09:00:00.000Z'];
const TIME_BUTTON = /^\d{2}:\d{2}$/;
const DATES_IN_STRIP = 14;

const CONFLICT_TEXT = 'Это время уже заняли — выберите другое';
const NO_SLOTS_TEXT = 'На этот день свободного времени нет';
const NETWORK_TEXT = 'Не получилось загрузить. Проверьте интернет';
const LOAD_FAILED_TEXT = 'Не получилось загрузить. Попробуйте еще раз';
const UNAUTHORIZED_TEXT = 'Откройте запись из чата с ботом';
const BOOKING_FAILED_TEXT = 'Не получилось записаться. Попробуйте еще раз';

type ApiCall = {
  path: string;
  method: string;
  headers: Headers;
  search: URLSearchParams;
  body: unknown;
};

type ApiOptions = {
  catalog?: () => Response;
  /** Сколько первых запросов каталога отклоняется ошибкой сети. */
  catalogNetworkFailures?: number;
  /** Список слотов или готовый ответ сервера (например, ошибка). */
  slots?: (date: string) => string[] | Response;
  booking?: () => Response | Promise<Response>;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const createApi = (options: ApiOptions = {}) => {
  const calls: ApiCall[] = [];
  let catalogAttempts = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://app.test',
    );

    calls.push({
      path: url.pathname,
      method: (init?.method ?? 'GET').toUpperCase(),
      headers: new Headers(init?.headers),
      search: url.searchParams,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });

    if (url.pathname === '/api/miniapp/catalog') {
      catalogAttempts += 1;

      if (catalogAttempts <= (options.catalogNetworkFailures ?? 0)) {
        throw new TypeError('Failed to fetch');
      }

      return options.catalog ? options.catalog() : json(CATALOG);
    }

    if (url.pathname === '/api/miniapp/slots') {
      const date = url.searchParams.get('date') ?? '';
      const slots = options.slots ? options.slots(date) : SLOT_TIMES.map((time) => `${date}${time}`);

      return slots instanceof Response ? slots : json({ slots });
    }

    if (url.pathname === '/api/miniapp/bookings') {
      return options.booking ? options.booking() : json({ id: 501 }, 201);
    }

    return json({ error: 'not found' }, 404);
  });

  vi.stubGlobal('fetch', fetchMock);

  return {
    calls,
    byPath: (pathname: string) => calls.filter((call) => call.path === pathname),
    slotDates: () => calls.filter((call) => call.path === '/api/miniapp/slots').map((call) => call.search.get('date')),
  };
};

/** Подставной bridge: журнал вызовов главной кнопки; нажать можно только на видимую и активную, как на платформе. */
const createFakeBridge = (platform: BridgePlatform) => {
  const handlers = new Set<() => void>();
  const state = { visible: false, enabled: true, text: '', log: [] as string[] };
  const bridge: Bridge = {
    platform,
    initData: `query_id=${platform}-query&user=%7B%22id%22%3A4242%7D&auth_date=1900000000&hash=${platform}hash`,
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

  return { bridge, state, press };
};

type FakeBridge = ReturnType<typeof createFakeBridge>;
type Api = ReturnType<typeof createApi>;

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

/** Услуга -> мастер -> время -> «Проверьте запись». Возвращает, какое время выбрано. */
const reachReview = async (api: Api, observe: (title: string) => void = () => {}) => {
  const user = userEvent.setup();

  observe((await heading(TITLES[0])).textContent ?? '');
  await user.click(await screen.findByText(/Мужская стрижка/));
  observe((await heading(TITLES[1])).textContent ?? '');
  await user.click(await screen.findByText(/Игорь Лесной/));
  observe((await heading(TITLES[2])).textContent ?? '');

  const slotButtons = await screen.findAllByRole('button', { name: TIME_BUTTON });
  const date = api.slotDates().at(-1);

  await user.click(slotButtons[1]);
  observe((await heading(TITLES[3])).textContent ?? '');

  return { startAt: `${date}${SLOT_TIMES[1]}` };
};

const pressMainButton = (fake: FakeBridge, times = 1) =>
  act(async () => {
    for (let index = 0; index < times; index += 1) {
      fake.press();
    }
  });

const renderFlow = (fake: FakeBridge) => render(<BookingFlow bridge={fake.bridge} />);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('F1: полный путь через bridge', () => {
  it.each<BridgePlatform>(['telegram', 'max'])(
    'F1 %s: запросы с tma-авторизацией и платформой, тело записи, «Вы записаны» на четвертом экране, без телефона',
    async (platform) => {
      const api = createApi();
      const fake = createFakeBridge(platform);
      const titles: string[] = [];

      renderFlow(fake);

      const { startAt } = await reachReview(api, (title) => titles.push(title));

      await pressMainButton(fake);
      await screen.findByText(/Вы записаны/);

      expect(api.calls.length).toBeGreaterThanOrEqual(3);
      expect(api.byPath('/api/miniapp/catalog')).toHaveLength(1);
      expect(api.byPath('/api/miniapp/slots').length).toBeGreaterThanOrEqual(1);
      api.calls.forEach((call) => {
        expect(call.path.startsWith('/api/miniapp/')).toBe(true);
        expect(call.headers.get('Authorization')).toBe(`tma ${fake.bridge.initData}`);
        expect(call.headers.get('X-Mini-App-Platform')).toBe(platform);
      });

      const posts = api.byPath('/api/miniapp/bookings');

      expect(posts).toHaveLength(1);
      expect(posts[0].method).toBe('POST');
      expect(posts[0].body).toEqual({ serviceId: 2, masterId: 11, startAt });

      expect(titles).toEqual(TITLES);
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      TITLES.slice(0, 3).forEach((title) => expect(screen.queryByRole('heading', { name: title })).toBeNull());

      expect(screen.queryByRole('textbox')).toBeNull();
      expect(document.querySelector('input[type="tel"]')).toBeNull();
      expect(screen.queryByText(/телефон/i)).toBeNull();
    },
  );
});

describe('F2: платформенные глобальные объекты не трогаются', () => {
  it('F2: за полный путь нет обращений к window.Telegram и window.WebApp', async () => {
    const accessLog: string[] = [];

    ['Telegram', 'WebApp'].forEach((key) =>
      Object.defineProperty(globalThis, key, {
        configurable: true,
        get: () => {
          accessLog.push(key);

          return undefined;
        },
      }),
    );

    try {
      const api = createApi();
      const fake = createFakeBridge('telegram');

      renderFlow(fake);
      await reachReview(api);
      await pressMainButton(fake);
      await screen.findByText(/Вы записаны/);
    } finally {
      ['Telegram', 'WebApp'].forEach((key) => Reflect.deleteProperty(globalThis, key));
    }

    expect(accessLog).toEqual([]);
  });
});

const SOURCE_ROOT = path.join(process.cwd(), 'src');
const BRIDGE_ROOT = path.join(SOURCE_ROOT, 'bridge');
const PLATFORM_ONLY = ['@telegram-apps/sdk', 'window.Telegram', 'Telegram.WebApp', 'window.WebApp', 'max-web-app'];

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (full === BRIDGE_ROOT) {
      return [];
    }

    return entry.isDirectory() ? sourceFiles(full) : [full];
  });

describe('F3: платформа только в src/bridge', () => {
  it('F3: вне src/bridge нет SDK Telegram, window.Telegram, window.WebApp и адреса скрипта MAX', () => {
    const files = sourceFiles(SOURCE_ROOT);
    const violations = files.flatMap((file) => {
      const content = readFileSync(file, 'utf8');

      return PLATFORM_ONLY.filter((pattern) => content.includes(pattern)).map(
        (pattern) => `${path.relative(SOURCE_ROOT, file)}: ${pattern}`,
      );
    });

    expect(files.length).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });
});

describe('F4: мастера выбранной услуги', () => {
  it('F4: услугу ведет один мастер из двух: на экране мастеров только он', async () => {
    createApi();

    const user = userEvent.setup();

    renderFlow(createFakeBridge('telegram'));
    await heading(TITLES[0]);
    await user.click(await screen.findByText(/Женская стрижка/));
    await heading(TITLES[1]);

    expect(screen.queryByText(/Алина Ветрова/)).not.toBeNull();
    expect(screen.queryByText(/Игорь Лесной/)).toBeNull();
  });
});

describe('F5: главная кнопка по шагам', () => {
  it('F5: на шагах 1-3 скрыта, на подтверждении «Записаться» и show(), после записи hide()', async () => {
    const api = createApi();
    const fake = createFakeBridge('max');
    const visibleAtStep: boolean[] = [];

    renderFlow(fake);
    await reachReview(api, () => visibleAtStep.push(fake.state.visible));

    expect(visibleAtStep.slice(0, 3)).toEqual([false, false, false]);
    expect(visibleAtStep[3]).toBe(true);
    expect(fake.state.text).toBe('Записаться');
    expect(fake.state.log).toContain('setText:Записаться');

    await pressMainButton(fake);
    await screen.findByText(/Вы записаны/);

    expect(fake.state.visible).toBe(false);
    expect(fake.state.log.filter((entry) => entry === 'show' || entry === 'hide').at(-1)).toBe('hide');
  });
});

describe('Крайние случаи', () => {
  it('E1: каталог ответил 401: «Откройте запись из чата с ботом», других запросов нет, кнопка скрыта', async () => {
    const api = createApi({ catalog: () => json({ error: 'unauthorized' }, 401) });
    const fake = createFakeBridge('telegram');

    renderFlow(fake);
    await screen.findByText('Откройте запись из чата с ботом');

    expect(api.calls).toHaveLength(1);
    expect(api.calls[0].path).toBe('/api/miniapp/catalog');
    expect(fake.state.visible).toBe(false);
  });

  it('E2: услуг нет: «Пока нет услуг для записи»', async () => {
    createApi({ catalog: () => json({ services: [], masters: [] }) });

    renderFlow(createFakeBridge('telegram'));

    await screen.findByText('Пока нет услуг для записи');
  });

  it('E3: на выбранный день слотов нет: сообщение; другая дата -> новый запрос слотов с этой датой', async () => {
    let emptyDate = '';
    const api = createApi({
      slots: (date) => {
        emptyDate ||= date;

        return date === emptyDate ? [] : SLOT_TIMES.map((time) => `${date}${time}`);
      },
    });
    const user = userEvent.setup();

    renderFlow(createFakeBridge('telegram'));
    await heading(TITLES[0]);
    await user.click(await screen.findByText(/Мужская стрижка/));
    await heading(TITLES[1]);
    await user.click(await screen.findByText(/Игорь Лесной/));
    await heading(TITLES[2]);
    await screen.findByText(NO_SLOTS_TEXT);

    const dates = [...document.querySelectorAll<HTMLElement>('[data-date]')];

    expect(dates).toHaveLength(DATES_IN_STRIP);
    expect(api.slotDates()).toEqual([dates[0].dataset.date]);

    await user.click(dates[1]);
    await screen.findAllByRole('button', { name: TIME_BUTTON });

    expect(api.slotDates()).toEqual([dates[0].dataset.date, dates[1].dataset.date]);
    expect(screen.queryByText(NO_SLOTS_TEXT)).toBeNull();
  });

  it('E4: запись ответила 409: «Это время уже заняли — выберите другое», экран времени, слоты запрошены заново', async () => {
    const api = createApi({ booking: () => json({ error: 'rejected' }, 409) });
    const fake = createFakeBridge('max');

    renderFlow(fake);
    await reachReview(api);
    expect(api.byPath('/api/miniapp/slots')).toHaveLength(1);

    await pressMainButton(fake);
    await screen.findByText(CONFLICT_TEXT);

    await heading(TITLES[2]);
    expect(screen.queryByRole('heading', { level: 1, name: TITLES[3] })).toBeNull();
    expect(api.byPath('/api/miniapp/bookings')).toHaveLength(1);
    expect(api.byPath('/api/miniapp/slots')).toHaveLength(2);
    expect(api.slotDates()[1]).toBe(api.slotDates()[0]);
  });

  it('E5: сеть отклонила запрос каталога: сообщение; «Повторить» -> повторный запрос и экран услуг', async () => {
    const api = createApi({ catalogNetworkFailures: 1 });
    const user = userEvent.setup();

    renderFlow(createFakeBridge('telegram'));
    await screen.findByText(NETWORK_TEXT);
    expect(api.byPath('/api/miniapp/catalog')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    await heading(TITLES[0]);
    await screen.findByText(/Мужская стрижка/);

    expect(api.byPath('/api/miniapp/catalog')).toHaveLength(2);
    expect(screen.queryByText(NETWORK_TEXT)).toBeNull();
  });

  it('E6: двойное нажатие главной кнопки: один POST', async () => {
    let release: (response: Response) => void = () => {};
    const api = createApi({ booking: () => new Promise<Response>((resolve) => (release = resolve)) });
    const fake = createFakeBridge('telegram');

    renderFlow(fake);
    await reachReview(api);

    await pressMainButton(fake, 2);
    expect(api.byPath('/api/miniapp/bookings')).toHaveLength(1);

    await act(async () => release(json({ id: 501 }, 201)));
    await screen.findByText(/Вы записаны/);

    expect(api.byPath('/api/miniapp/bookings')).toHaveLength(1);
  });

  it('E7: каталог ответил 500: «Попробуйте еще раз», не про интернет; «Повторить» -> повторный запрос и экран услуг', async () => {
    let catalogAttempts = 0;
    const api = createApi({
      catalog: () => {
        catalogAttempts += 1;

        return catalogAttempts === 1 ? json({ error: 'internal' }, 500) : json(CATALOG);
      },
    });
    const user = userEvent.setup();

    renderFlow(createFakeBridge('telegram'));
    await screen.findByText(LOAD_FAILED_TEXT);
    expect(screen.queryByText(NETWORK_TEXT)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    await heading(TITLES[0]);
    await screen.findByText(/Мужская стрижка/);

    expect(api.byPath('/api/miniapp/catalog')).toHaveLength(2);
    expect(screen.queryByText(LOAD_FAILED_TEXT)).toBeNull();
  });

  it('E8: слоты ответили 500: на экране времени «Попробуйте еще раз», не про интернет; «Повторить» -> слоты той же даты', async () => {
    let slotsAttempts = 0;
    const api = createApi({
      slots: (date) => {
        slotsAttempts += 1;

        return slotsAttempts === 1 ? json({ error: 'internal' }, 500) : SLOT_TIMES.map((time) => `${date}${time}`);
      },
    });
    const user = userEvent.setup();

    renderFlow(createFakeBridge('max'));
    await user.click(await screen.findByText(/Мужская стрижка/));
    await user.click(await screen.findByText(/Игорь Лесной/));
    await heading(TITLES[2]);
    await screen.findByText(LOAD_FAILED_TEXT);
    expect(screen.queryByText(NETWORK_TEXT)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    await screen.findAllByRole('button', { name: TIME_BUTTON });

    expect(api.slotDates()).toHaveLength(2);
    expect(api.slotDates()[1]).toBe(api.slotDates()[0]);
    expect(screen.queryByText(LOAD_FAILED_TEXT)).toBeNull();
  });

  it('E9: запись ответила 401: «Откройте запись из чата с ботом», главная кнопка скрыта, без «Попробуйте еще раз»', async () => {
    const api = createApi({ booking: () => json({ error: 'unauthorized' }, 401) });
    const fake = createFakeBridge('telegram');

    renderFlow(fake);
    await reachReview(api);

    await pressMainButton(fake);
    await screen.findByText(UNAUTHORIZED_TEXT);

    expect(api.byPath('/api/miniapp/bookings')).toHaveLength(1);
    expect(fake.state.visible).toBe(false);
    expect(screen.queryByText(BOOKING_FAILED_TEXT)).toBeNull();
  });
});
