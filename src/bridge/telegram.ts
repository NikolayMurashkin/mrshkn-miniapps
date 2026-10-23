import { on, postEvent, retrieveLaunchParams, retrieveRawInitData } from '@telegram-apps/sdk';
import { EMPTY_LAUNCH, LIGHT_COLORS, SCAN_QR_TEXT, SCAN_QR_TIMEOUT_MS } from './consts';
import { brightness, isHexColor } from './color';
import type { Bridge, BridgeColors, BridgeTheme, MainButton, TelegramLaunch, TelegramThemeParams } from './types';

/**
 * Параметры запуска берем из адреса страницы без строгой проверки схемы: SDK отвергает initData без поля
 * `signature` и тогда отказывается работать вовсе, а подпись проверяет бэк.
 */
const readPageLaunch = (): TelegramLaunch | null => {
  const params = new URLSearchParams(window.location.href.replace(/^[^?#]*[?#]/, '').replace(/[?#]/g, '&'));
  const initData = params.get('tgWebAppData');

  if (!initData) {
    return null;
  }

  try {
    return { initData, themeParams: JSON.parse(params.get('tgWebAppThemeParams') ?? '{}') as TelegramThemeParams };
  } catch {
    // тема не разобралась: останутся цвета по умолчанию
    return { initData, themeParams: {} };
  }
};

/**
 * В адресе нет `tgWebAppData` — запасной путь через разбор SDK: адрес, запись навигации `performance`, хранилище.
 * Схема здесь строгая, а в хранилище SDK пишет только после своего успешного разбора.
 */
const readStoredLaunch = (): TelegramLaunch => {
  try {
    return {
      initData: retrieveRawInitData() ?? '',
      themeParams: retrieveLaunchParams().tgWebAppThemeParams ?? {},
    };
  } catch {
    // страница открыта не из Telegram: initData нет, API ответит 401
    return EMPTY_LAUNCH;
  }
};

const pick = (value: string | undefined, fallback: string): string =>
  value && isHexColor(value) ? value.toLowerCase() : fallback;

const readTheme = (params: TelegramThemeParams): BridgeTheme => {
  const colors: BridgeColors = {
    bg: pick(params.bg_color, LIGHT_COLORS.bg),
    text: pick(params.text_color, LIGHT_COLORS.text),
    hint: pick(params.hint_color, LIGHT_COLORS.hint),
    link: pick(params.link_color, LIGHT_COLORS.link),
    button: pick(params.button_color, LIGHT_COLORS.button),
    buttonText: pick(params.button_text_color, LIGHT_COLORS.buttonText),
    secondaryBg: pick(params.secondary_bg_color, LIGHT_COLORS.secondaryBg),
  };

  return { scheme: brightness(colors.bg) < brightness(colors.text) ? 'dark' : 'light', colors };
};

/** Главная кнопка Telegram хранит состояние на стороне клиента: каждое изменение шлем целиком одним событием. */
const createMainButton = (): MainButton => {
  const state = { text: '', isVisible: false, isEnabled: true, isProgressVisible: false };
  const update = (changes: Partial<typeof state>) => {
    Object.assign(state, changes);
    postEvent('web_app_setup_main_button', {
      text: state.text,
      is_visible: state.isVisible,
      is_active: state.isEnabled,
      is_progress_visible: state.isProgressVisible,
    });
  };

  return {
    setText: (text) => update({ text }),
    show: () => update({ isVisible: true }),
    hide: () => update({ isVisible: false }),
    enable: () => update({ isEnabled: true }),
    disable: () => update({ isEnabled: false }),
    showProgress: () => update({ isProgressVisible: true }),
    hideProgress: () => update({ isProgressVisible: false }),
    onClick: (handler) => on('main_button_pressed', handler),
  };
};

/**
 * Сканер QR клиента Telegram: первая прочитанная строка закрывает его, закрытие без строки — null.
 * Клиент может не ответить вовсе — тогда сканер закрывается по таймауту, результат тоже null.
 */
const scanQr = (): Promise<string | null> =>
  new Promise((resolve) => {
    const offs: (() => void)[] = [];
    let done = false;
    const finish = (value: string | null) => {
      if (done) {
        return;
      }

      done = true;
      clearTimeout(timer);
      offs.forEach((off) => off());
      resolve(value);
    };
    const timer = setTimeout(() => {
      postEvent('web_app_close_scan_qr_popup');
      finish(null);
    }, SCAN_QR_TIMEOUT_MS);

    offs.push(
      on('qr_text_received', ({ data }) => {
        postEvent('web_app_close_scan_qr_popup');
        finish(data || null);
      }),
      on('scan_qr_popup_closed', () => finish(null)),
    );

    try {
      postEvent('web_app_open_scan_qr_popup', { text: SCAN_QR_TEXT });
    } catch {
      finish(null);
    }
  });

export const createTelegramBridge = (): Bridge => {
  const launch = readPageLaunch() ?? readStoredLaunch();

  postEvent('web_app_ready');

  return {
    platform: 'telegram',
    initData: launch.initData,
    theme: readTheme(launch.themeParams),
    mainButton: createMainButton(),
    scanQr,
  };
};
