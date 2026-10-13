import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';
import { buildInitData } from '../helpers/sign-init-data';
import {
  GUEST_TELEGRAM_USER,
  MENU_CAPPUCCINO,
  MENU_CROISSANT,
  ORDER_BUTTON_TEXT,
  OWNER_CHAT_ID,
  SINK_BASE_URL,
  STAFF_TELEGRAM_USER,
  TELEGRAM_BOT_TOKEN,
  TEST_DATABASE_URI,
} from './consts';
import type { BotMessage, SinkCall } from './types';

type MainButtonState = { text?: string; is_visible?: boolean; is_active?: boolean };
type OrderRow = { status: string; total: string | number };

const withDatabase = async <T>(work: (client: Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: TEST_DATABASE_URI });

  await client.connect();

  try {
    return await work(client);
  } finally {
    await client.end();
  }
};

/** Чужой сети нет: наружу не уходит ничего. */
const blockExternalNetwork = async (page: Page) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (route) => route.abort());
};

/** Подставной хост Telegram: пишет события, которые приложение шлет клиенту. */
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

/** Mini App «Лояльность» в Telegram с подписанной initData пользователя. */
const openLoyalty = async (page: Page, user: { id: number; first_name: string }) => {
  const launchParams = new URLSearchParams({
    tgWebAppData: buildInitData({ botToken: TELEGRAM_BOT_TOKEN, user, authDate: new Date() }),
    tgWebAppVersion: '8.0',
    tgWebAppPlatform: 'web',
    tgWebAppThemeParams: JSON.stringify({ bg_color: '#ffffff', text_color: '#000000', button_color: '#50a8eb' }),
  });

  await blockExternalNetwork(page);
  await mockTelegramHost(page);
  await page.goto(`/loyalty/telegram#${launchParams.toString()}`);
};

/** Вкладка: роль tab, а если вкладки сделаны кнопками — кнопка с тем же названием. */
const tab = (page: Page, name: string) =>
  page.getByRole('tab', { name, exact: true }).or(page.getByRole('button', { name, exact: true }));

const ownerOrderMessages = async (page: Page): Promise<BotMessage[]> => {
  const calls = (await (await page.request.get(`${SINK_BASE_URL}/calls`)).json()) as SinkCall[];

  return calls
    .filter((call) => call.channel === 'telegram' && call.path === `/telegram/bot${TELEGRAM_BOT_TOKEN}/sendMessage`)
    .map((call) => JSON.parse(call.body) as BotMessage)
    .filter(
      (message) =>
        String(message.chat_id) === OWNER_CHAT_ID &&
        Boolean(message.text?.includes(MENU_CAPPUCCINO) && message.text?.includes(MENU_CROISSANT)),
    );
};

/** Кассира засев не знает: строка в таблицу staff; заказы прошлых прогонов стираются. */
test.beforeAll(async () => {
  await withDatabase(async (client) => {
    const { rows } = await client.query<{ staff: string | null; orders: string | null }>(
      "SELECT to_regclass('public.staff')::text AS staff, to_regclass('public.orders')::text AS orders",
    );

    expect(rows[0]?.staff, 'нет таблицы staff (кассиры)').not.toBeNull();
    expect(rows[0]?.orders, 'нет таблицы orders (предзаказы)').not.toBeNull();

    await client.query('TRUNCATE orders RESTART IDENTITY CASCADE');
    await client.query('DELETE FROM staff WHERE platform = $1 AND platform_user_id = $2', [
      'telegram',
      String(STAFF_TELEGRAM_USER.id),
    ]);
    await client.query(
      `INSERT INTO staff (platform, platform_user_id, name, active, updated_at, created_at)
       VALUES ($1, $2, $3, true, now(), now())`,
      ['telegram', String(STAFF_TELEGRAM_USER.id), STAFF_TELEGRAM_USER.first_name],
    );
  });
});

test.beforeEach(async ({ page }) => {
  await page.request.delete(`${SINK_BASE_URL}/calls`);
});

test('S1 Telegram: гость выбирает позиции меню и оформляет предзаказ -> у кассира «Новый», сообщение в заглушке бота', async ({
  page,
  context,
}) => {
  await openLoyalty(page, GUEST_TELEGRAM_USER);
  await tab(page, 'Меню').click();

  const addCappuccino = page.getByRole('button', { name: `Добавить «${MENU_CAPPUCCINO}»`, exact: true });

  await addCappuccino.click();
  await addCappuccino.click();
  await page.getByRole('button', { name: `Добавить «${MENU_CROISSANT}»`, exact: true }).click();
  await page.getByRole('radio', { name: 'Через 15 минут', exact: true }).check();

  await expect
    .poll(() => telegramMainButton(page))
    .toMatchObject({ text: ORDER_BUTTON_TEXT, is_visible: true, is_active: true });
  await pressTelegramMainButton(page);
  await expect(page.getByRole('heading', { name: 'Заказ принят' })).toBeVisible();

  const orders = await withDatabase(
    async (client) => (await client.query<OrderRow>('SELECT status, total FROM orders')).rows,
  );

  expect(orders).toHaveLength(1);
  expect(orders[0]!.status).toBe('new');
  expect(Number(orders[0]!.total)).toBe(710);

  await expect.poll(async () => (await ownerOrderMessages(page)).length).toBe(1);

  const staffPage = await context.newPage();

  await openLoyalty(staffPage, STAFF_TELEGRAM_USER);
  await tab(staffPage, 'Заказы').click();

  // карточка — самый вложенный блок, где есть обе позиции и статус: предки идут в DOM раньше потомков
  const card = staffPage
    .locator('li, article, section, div')
    .filter({ hasText: `${MENU_CAPPUCCINO} × 2` })
    .filter({ hasText: `${MENU_CROISSANT} × 1` })
    .filter({ has: staffPage.getByText('Новый', { exact: true }) })
    .last();

  await expect(card).toBeVisible();
});
