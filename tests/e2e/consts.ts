export const APP_PORT = 3410;
export const APP_BASE_URL = `http://127.0.0.1:${APP_PORT}`;
export const SINK_PORT = 3411;
export const SINK_BASE_URL = `http://127.0.0.1:${SINK_PORT}`;

/** Сброс схемы стирает базу: имя обязано кончаться на _test, как у интеграционных тестов. */
export const TEST_DATABASE_URI =
  process.env.TEST_DATABASE_URI ?? 'postgres://miniapps:miniapps@127.0.0.1:5436/miniapps_test';

export const TELEGRAM_BOT_TOKEN = '777777:E2E-telegram-token';
export const MAX_BOT_TOKEN = 'e2e-max-token';
export const OWNER_CHAT_ID = '555000';
export const PAYLOAD_SECRET = 'e2e-tests';

export const TELEGRAM_USER = { id: 424242, first_name: 'Анна', username: 'anna_e2e' };
export const MAX_USER = { id: 909090, first_name: 'Олег' };

export const SERVICE_NAME = 'Мужская стрижка';
export const MASTER_NAME = 'Игорь Лесной';
export const MAIN_BUTTON_TEXT = 'Записаться';

/** Скрипт MAX Bridge: страница грузит его с этого адреса, тест подменяет его своим. */
export const MAX_BRIDGE_SCRIPT_URL = 'https://st.max.ru/js/max-web-app.js';
