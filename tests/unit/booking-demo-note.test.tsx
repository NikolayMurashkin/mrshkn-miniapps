// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingFlow } from '@/booking/BookingFlow';
import type { Bridge } from '@/bridge/types';

const DEMO_NOTE = 'Демо-проект студии MRSHKN';
/** Пробелы в подписи могут быть неразрывными: сравнение — по тексту с обычными пробелами. */
const plainText = (node: Element | null | undefined): string => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

const SERVICES = [
  { id: 1, name: 'Женская стрижка', durationMin: 60 },
  { id: 2, name: 'Мужская стрижка', durationMin: 30 },
];
const MASTERS = [
  { id: 10, name: 'Алина Ветрова', services: [1, 2] },
  { id: 11, name: 'Игорь Лесной', services: [2] },
];
const CATALOG = { services: SERVICES, masters: MASTERS, timeZone: 'Europe/Kaliningrad' };
const TITLES = {
  service: 'Выберите услугу',
  master: 'Выберите мастера',
  time: 'Выберите время',
  review: 'Проверьте запись',
};
const SLOT_TIMES = ['T08:00:00.000Z', 'T08:30:00.000Z', 'T09:00:00.000Z'];
const TIME_BUTTON = /^\d{2}:\d{2}$/;

const LOADING_TEXT = 'Загрузка…';
const NO_SERVICES_TEXT = 'Пока нет услуг для записи';
const UNAUTHORIZED_TEXT = 'Откройте запись из чата с ботом';
const NETWORK_TEXT = 'Не получилось загрузить. Проверьте интернет';
const LOAD_FAILED_TEXT = 'Не получилось загрузить. Попробуйте еще раз';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Мок fetch: каталог — ответ сценария (или отказ сети), слоты — три на любую дату, запись — 201. */
const mockApi = (catalog: () => Response | Promise<Response>) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://app.test',
    );

    switch (url.pathname) {
      case '/api/miniapp/catalog':
        return catalog();
      case '/api/miniapp/slots': {
        const date = url.searchParams.get('date') ?? '';

        return json({ slots: SLOT_TIMES.map((time) => `${date}${time}`) });
      }
      case '/api/miniapp/bookings':
        return json({ id: 501 }, 201);
      default:
        return json({ error: 'not found' }, 404);
    }
  });

  vi.stubGlobal('fetch', fetchMock);
};

/** Подставной bridge: главную кнопку можно нажать, только когда она видима и активна, как на платформе. */
const createFakeBridge = () => {
  const handlers = new Set<() => void>();
  const state = { visible: false, enabled: true };
  const bridge: Bridge = {
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
    scanQr: async () => null,
    mainButton: {
      setText: () => {},
      show: () => {
        state.visible = true;
      },
      hide: () => {
        state.visible = false;
      },
      enable: () => {
        state.enabled = true;
      },
      disable: () => {
        state.enabled = false;
      },
      showProgress: () => {},
      hideProgress: () => {},
      onClick: (handler) => {
        handlers.add(handler);

        return () => {
          handlers.delete(handler);
        };
      },
    },
  };
  const press = () =>
    act(async () => {
      if (state.visible && state.enabled) {
        [...handlers].forEach((handler) => handler());
      }
    });

  return { bridge, press };
};

type FakeBridge = ReturnType<typeof createFakeBridge>;

const mainOf = (): HTMLElement => {
  const main = document.querySelector('main');

  expect(main, 'нет <main>').not.toBeNull();

  return main as HTMLElement;
};

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

/** Подпись одна, она — последний элемент main; элементы экрана стоят до нее и не входят в нее. */
const expectNoteLast = (screenName: string, before: Element[]) => {
  const main = mainOf();
  const notes = screen.queryAllByText(DEMO_NOTE);

  expect(notes, `строк «${DEMO_NOTE}» на экране «${screenName}»`).toHaveLength(1);
  expect(plainText(main.lastElementChild), `последний элемент main на экране «${screenName}»`).toBe(DEMO_NOTE);
  expect(main.lastElementChild?.contains(notes[0]!)).toBe(true);
  expect(before.length).toBeGreaterThan(0);
  before.forEach((element) => {
    expect(main.contains(element)).toBe(true);
    expect(main.lastElementChild?.contains(element)).toBe(false);
    expect(element.compareDocumentPosition(notes[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
};

/** Подписи нет ни отдельной строкой, ни внутри другого текста main. */
const expectNoNote = (label: string) => {
  expect(screen.queryAllByText(DEMO_NOTE), label).toHaveLength(0);
  expect(plainText(mainOf()), label).not.toContain('Демо-проект');
};

const renderFlow = (catalog: () => Response | Promise<Response>) => {
  mockApi(catalog);

  const fake = createFakeBridge();

  render(<BookingFlow bridge={fake.bridge} />);

  return fake;
};

const listOf = (element: HTMLElement): Element => {
  const list = element.closest('ul');

  expect(list, 'кнопка не в списке').not.toBeNull();

  return list as Element;
};

/**
 * Услуга -> мастер -> время -> подтверждение -> главная кнопка -> «готово».
 * На каждом экране вызывает check с именем экрана и элементами, которые стоят до подписи.
 */
const walkFullPath = async (fake: FakeBridge, check: (screenName: string, before: Element[]) => void) => {
  const user = userEvent.setup();

  const serviceTitle = await heading(TITLES.service);
  const serviceButton = await screen.findByText(/Мужская стрижка/);

  check('услуга', [serviceTitle, listOf(serviceButton)]);
  await user.click(serviceButton);

  const masterTitle = await heading(TITLES.master);
  const masterButton = await screen.findByText(/Игорь Лесной/);

  check('мастер', [masterTitle, listOf(masterButton)]);
  await user.click(masterButton);

  const timeTitle = await heading(TITLES.time);
  const slotButtons = await screen.findAllByRole('button', { name: TIME_BUTTON });

  check('время', [timeTitle, listOf(slotButtons[1]!), ...document.querySelectorAll('[data-date]')]);
  await user.click(slotButtons[1]!);

  const reviewTitle = await heading(TITLES.review);
  const summary = document.querySelector('dl');

  expect(summary, 'нет сводки записи').not.toBeNull();
  check('подтверждение', [reviewTitle, summary as Element]);

  await fake.press();

  const done = await screen.findByText(/Вы записаны/);

  check('готово', [screen.getByRole('heading', { level: 1 }), summary as Element, done]);
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('подпись демо-экземпляра на экранах «Записи»', () => {
  it('demo: true — на экране «Выберите услугу» одна строка «Демо-проект студии MRSHKN», последний элемент main после заголовка и списка услуг', async () => {
    renderFlow(() => json({ ...CATALOG, demo: true }));

    const title = await heading(TITLES.service);
    const serviceButton = await screen.findByText(/Женская стрижка/);

    expectNoteLast('услуга', [title, listOf(serviceButton)]);
  });

  it('demo: true, полный путь до «готово» — на каждом из пяти экранов подпись одна и последняя в main', async () => {
    const fake = renderFlow(() => json({ ...CATALOG, demo: true }));
    const checked: string[] = [];

    await walkFullPath(fake, (screenName, before) => {
      expectNoteLast(screenName, before);
      checked.push(screenName);
    });

    expect(checked).toEqual(['услуга', 'мастер', 'время', 'подтверждение', 'готово']);
  });

  it('каталог без поля demo и с demo: false — подписи нет; demo: false — нет и на «готово» после полного пути', async () => {
    renderFlow(() => json(CATALOG));
    await heading(TITLES.service);
    await screen.findByText(/Женская стрижка/);
    expectNoNote('без поля demo, экран услуг');
    cleanup();
    vi.unstubAllGlobals();

    const fake = renderFlow(() => json({ ...CATALOG, demo: false }));
    const checked: string[] = [];

    await walkFullPath(fake, (screenName) => {
      expectNoNote(`demo: false, экран «${screenName}»`);
      checked.push(screenName);
    });

    expect(checked).toEqual(['услуга', 'мастер', 'время', 'подтверждение', 'готово']);
  });

  it('demo: true, услуг нет — «Пока нет услуг для записи» и подпись последней в main', async () => {
    renderFlow(() => json({ services: [], masters: [], timeZone: 'Europe/Kaliningrad', demo: true }));

    const empty = await screen.findByText(NO_SERVICES_TEXT);

    expectNoteLast('нет услуг', [empty]);
  });

  it.each<[string, () => Response | Promise<Response>, string]>([
    ['401', () => json({ error: 'unauthorized', demo: true }, 401), UNAUTHORIZED_TEXT],
    [
      'отказ сети',
      () => {
        throw new TypeError('Failed to fetch');
      },
      NETWORK_TEXT,
    ],
    ['500', () => json({ error: 'internal', demo: true }, 500), LOAD_FAILED_TEXT],
  ])('каталог не загрузился (%s) — сообщение об ошибке, подписи нет', async (_label, catalog, message) => {
    renderFlow(catalog);

    await screen.findByText(message);

    expectNoNote(`ошибка каталога: ${message}`);
  });

  it('каталог еще не ответил — «Загрузка…», подписи нет', async () => {
    renderFlow(() => new Promise<Response>(() => {}));

    await screen.findByText(LOADING_TEXT);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(screen.getByText(LOADING_TEXT)).not.toBeNull();
    expectNoNote('загрузка каталога');
  });

  it.each<[string, unknown]>([
    ['строка "true"', 'true'],
    ['число 1', 1],
  ])('demo — %s, не true — подписи нет', async (_label, demo) => {
    renderFlow(() => json({ ...CATALOG, demo }));

    await heading(TITLES.service);
    await screen.findByText(/Женская стрижка/);

    expectNoNote(`demo: ${JSON.stringify(demo)}`);
  });
});
