import { defineConfig, devices } from '@playwright/test';
import {
  APP_BASE_URL,
  APP_PORT,
  MAX_BOT_TOKEN,
  OWNER_CHAT_ID,
  PAYLOAD_SECRET,
  SINK_BASE_URL,
  TELEGRAM_BOT_TOKEN,
  TEST_DATABASE_URI,
} from './tests/e2e/consts';

/** Приложение собирается и стартует на тестовой базе; боты смотрят в заглушку, CRM выключена, чужой сети нет. */
const APP_ENV = {
  NEXT_DIST_DIR: '.next-e2e',
  DATABASE_URI: TEST_DATABASE_URI,
  PAYLOAD_SECRET,
  TELEGRAM_BOT_TOKEN,
  MAX_BOT_TOKEN,
  OWNER_TELEGRAM_CHAT_ID: OWNER_CHAT_ID,
  CRM_WEBHOOK_URL: '',
  TELEGRAM_API_BASE: `${SINK_BASE_URL}/telegram`,
  MAX_API_BASE: `${SINK_BASE_URL}/max`,
};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: APP_BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node tests/e2e/bot-sink.ts',
      url: `${SINK_BASE_URL}/calls`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: 'pipe',
    },
    {
      command: `node tests/e2e/prepare-database.ts && yarn seed && yarn build && yarn start -p ${APP_PORT}`,
      // у приложения нет главной страницы (404), а каталог без авторизации отвечает 401: сервер поднят
      url: `${APP_BASE_URL}/api/miniapp/catalog`,
      env: APP_ENV,
      reuseExistingServer: !process.env.CI,
      timeout: 600_000,
      stdout: 'pipe',
    },
  ],
});
