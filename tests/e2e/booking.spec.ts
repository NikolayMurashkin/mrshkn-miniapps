import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';
import { buildInitData } from '../helpers/sign-init-data';
import {
  MAIN_BUTTON_TEXT,
  MASTER_NAME,
  MAX_BOT_TOKEN,
  MAX_BRIDGE_SCRIPT_URL,
  MAX_USER,
  OWNER_CHAT_ID,
  SERVICE_NAME,
  SINK_BASE_URL,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_USER,
  TEST_DATABASE_URI,
} from './consts';
import type { BotMessage, SinkCall } from './types';

const TIME_BUTTON = /^\d{2}:\d{2}$/;
const TELEGRAM_THEME = {
  bg_color: '#17212b',
  text_color: '#f5f5f5',
  hint_color: '#708499',
  link_color: '#6ab3f3',
  button_color: '#5288c1',
  button_text_color: '#ffffff',
  secondary_bg_color: '#232e3c',
};

type BookingRow = {
  platform: string;
  platform_user_id: string;
  service_name: string;
  master_name: string;
  start_at: Date;
};

const initDataFor = (botToken: string, user: { id: number }) => buildInitData({ botToken, user, authDate: new Date() });

/** Чужой сети нет: наружу не уходит ничего, кроме подставного скрипта MAX. */
const blockExternalNetwork = async (page: Page) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (route) => route.abort());
};

/** Подставной хост Telegram: пишет события, которые приложение шлет клиенту, и умеет «нажать» главную кнопку. */
const mockTelegramHost = async (page: Page) => {
  await page.addInitScript(() => {
    const host = window as unknown as { __sent: [string, unknown][]; TelegramWebviewProxy: unknown };

    host.__sent = [];
    host.TelegramWebviewProxy = {
      postEvent: (name: string, params?: string) => {
        host.__sent.push([name, params ? JSON.parse(params) : {}]);
      },
    };
  });
};

type MainButtonState = { text?: string; is_visible?: boolean; is_active?: boolean };

const telegramMainButton = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __sent: [string, MainButtonState][] }).__sent
        .filter(([name]) => name === 'web_app_setup_main_button')
        .map(([, params]) => params)
        .at(-1) ?? null,
  );

const pressTelegramMainButton = (page: Page) =>
  page.evaluate(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ eventType: 'main_button_pressed', eventData: undefined }),
        source: window.parent,
      }),
    );
  });

/** Подставной MAX Bridge: страница грузит скрипт с st.max.ru, тест отдает вместо него свой `window.WebApp`. */
const mockMaxBridge = async (page: Page, initData: string) => {
  await page.route(MAX_BRIDGE_SCRIPT_URL, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.WebApp = {
        initData: ${JSON.stringify(initData)},
        initDataUnsafe: {},
        platform: 'web',
        version: '1.0',
        BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
        HapticFeedback: { impactOccurred() {} },
      };`,
    }),
  );
};

const botCalls = async (page: Page): Promise<SinkCall[]> => {
  const response = await page.request.get(`${SINK_BASE_URL}/calls`);

  return (await response.json()) as SinkCall[];
};

const messageOf = (call: SinkCall): BotMessage => JSON.parse(call.body) as BotMessage;

const readBookings = async (): Promise<BookingRow[]> => {
  const client = new Client({ connectionString: TEST_DATABASE_URI });

  await client.connect();

  try {
    const { rows } = await client.query<BookingRow>(
      `SELECT b.platform, c.platform_user_id, s.name AS service_name, m.name AS master_name, b.start_at
         FROM bookings b
         JOIN clients c ON c.id = b.client_id
         JOIN services s ON s.id = b.service_id
         JOIN masters m ON m.id = b.master_id`,
    );

    return rows;
  } finally {
    await client.end();
  }
};

const clearBookings = async () => {
  const client = new Client({ connectionString: TEST_DATABASE_URI });

  await client.connect();
  await client.query('TRUNCATE bookings, clients, reminders RESTART IDENTITY CASCADE');
  await client.end();
};

/** Услуга -> мастер -> первый свободный слот -> «Проверьте запись». Возвращает ISO выбранного слота. */
const chooseFirstFreeSlot = async (page: Page): Promise<string> => {
  const isSlots = (url: string) => new URL(url).pathname === '/api/miniapp/slots';
  const slotsOf = async (response: { json(): Promise<unknown> }) =>
    ((await response.json()) as { slots: string[] }).slots;

  await expect(page.getByRole('heading', { level: 1, name: 'Выберите услугу' })).toBeVisible();
  await page.getByText(SERVICE_NAME).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Выберите мастера' })).toBeVisible();

  const firstDay = page.waitForResponse((response) => isSlots(response.url()));

  await page.getByText(MASTER_NAME).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Выберите время' })).toBeVisible();

  let slots = await slotsOf(await firstDay);
  const dates = page.locator('[data-date]');
  const days = await dates.count();

  for (let day = 1; slots.length === 0 && day < days; day += 1) {
    const [response] = await Promise.all([
      page.waitForResponse((candidate) => isSlots(candidate.url())),
      dates.nth(day).click(),
    ]);

    slots = await slotsOf(response);
  }

  expect(slots.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: TIME_BUTTON }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Проверьте запись' })).toBeVisible();

  return [...slots].sort()[0];
};

test.beforeEach(async ({ page }) => {
  await clearBookings();
  await page.request.delete(`${SINK_BASE_URL}/calls`);
  await blockExternalNetwork(page);
});

test('S1-tg: Telegram: услуга, мастер, слот, подтверждение -> запись в Payload и сообщение в заглушке бота', async ({
  page,
}) => {
  const initData = initDataFor(TELEGRAM_BOT_TOKEN, TELEGRAM_USER);
  const launchParams = new URLSearchParams({
    tgWebAppData: initData,
    tgWebAppVersion: '8.0',
    tgWebAppPlatform: 'web',
    tgWebAppThemeParams: JSON.stringify(TELEGRAM_THEME),
  });

  await mockTelegramHost(page);
  await page.goto(`/booking/telegram#${launchParams.toString()}`);

  const startAt = await chooseFirstFreeSlot(page);

  await expect.poll(() => telegramMainButton(page)).toMatchObject({ text: MAIN_BUTTON_TEXT, is_visible: true });
  await pressTelegramMainButton(page);
  await expect(page.getByText('Вы записаны')).toBeVisible();

  const bookings = await readBookings();

  expect(bookings).toHaveLength(1);
  expect(bookings[0].platform).toBe('telegram');
  expect(bookings[0].platform_user_id).toBe(String(TELEGRAM_USER.id));
  expect(bookings[0].service_name).toBe(SERVICE_NAME);
  expect(bookings[0].master_name).toBe(MASTER_NAME);
  expect(bookings[0].start_at.toISOString()).toBe(new Date(startAt).toISOString());

  await expect
    .poll(
      async () =>
        (await botCalls(page))
          .filter(
            (call) => call.channel === 'telegram' && call.path === `/telegram/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          )
          .map(messageOf)
          .filter(
            (message) => String(message.chat_id) === String(TELEGRAM_USER.id) && message.text?.includes(SERVICE_NAME),
          ).length,
    )
    .toBe(1);
  // владельцу уходит свое уведомление, не клиентское
  expect((await botCalls(page)).map(messageOf).some((message) => String(message.chat_id) === OWNER_CHAT_ID)).toBe(true);
});

test('S1-max: MAX: услуга, мастер, слот, подтверждение -> запись в Payload и сообщение в заглушке бота', async ({
  page,
}) => {
  const initData = initDataFor(MAX_BOT_TOKEN, MAX_USER);
  // MAX кладет initData в адрес дважды закодированным
  const hash = `WebAppData=${encodeURIComponent(encodeURIComponent(initData))}&WebAppPlatform=web&WebAppVersion=1.0`;

  await mockMaxBridge(page, initData);
  await page.goto(`/booking/max#${hash}`);

  const startAt = await chooseFirstFreeSlot(page);

  const button = page.locator('button[data-bridge-main-button]');

  await expect(button).toBeVisible();
  await expect(button).toHaveText(MAIN_BUTTON_TEXT);
  await button.click();
  await expect(page.getByText('Вы записаны')).toBeVisible();

  const bookings = await readBookings();

  expect(bookings).toHaveLength(1);
  expect(bookings[0].platform).toBe('max');
  expect(bookings[0].platform_user_id).toBe(String(MAX_USER.id));
  expect(bookings[0].service_name).toBe(SERVICE_NAME);
  expect(bookings[0].master_name).toBe(MASTER_NAME);
  expect(bookings[0].start_at.toISOString()).toBe(new Date(startAt).toISOString());

  await expect
    .poll(
      async () =>
        (await botCalls(page)).filter(
          (call) =>
            call.channel === 'max' &&
            call.path === '/max/messages' &&
            call.query.user_id === String(MAX_USER.id) &&
            (JSON.parse(call.body) as BotMessage).text?.includes(SERVICE_NAME),
        ).length,
    )
    .toBe(1);
});
