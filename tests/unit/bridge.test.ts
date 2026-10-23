// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bridge } from '@/bridge/types';
import { buildInitData } from '../helpers/sign-init-data';

const TELEGRAM_TOKEN = '123456:TG-bridge-token';
const MAX_TOKEN = 'max-bridge-token';
const AUTH_DATE = new Date('2030-03-12T11:59:00.000Z');
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const COLOR_KEYS = ['bg', 'button', 'buttonText', 'hint', 'link', 'secondaryBg', 'text'];
const MAIN_BUTTON_KEYS = ['disable', 'enable', 'hide', 'hideProgress', 'onClick', 'setText', 'show', 'showProgress'];
const BRIDGE_KEYS = ['initData', 'mainButton', 'platform', 'scanQr', 'theme'];

const TELEGRAM_INIT_DATA = buildInitData({
  botToken: TELEGRAM_TOKEN,
  user: { id: 4242, first_name: 'Анна Мария', username: 'anna_test' },
  authDate: AUTH_DATE,
  extra: { query_id: 'AAH-test', signature: 'sig_test-1' },
});
const MAX_INIT_DATA = buildInitData({
  botToken: MAX_TOKEN,
  user: { id: 9001, first_name: 'Олег' },
  authDate: AUTH_DATE,
  extra: { query_id: 'max-query' },
});

const TELEGRAM_PALETTES = {
  dark: {
    bg_color: '#17212b',
    text_color: '#f5f5f5',
    hint_color: '#708499',
    link_color: '#6ab3f3',
    button_color: '#5288c1',
    button_text_color: '#ffffff',
    secondary_bg_color: '#232e3c',
  },
  light: {
    bg_color: '#ffffff',
    text_color: '#000000',
    hint_color: '#999999',
    link_color: '#2678b6',
    button_color: '#50a8eb',
    button_text_color: '#ffffff',
    secondary_bg_color: '#efeff3',
  },
} as const;

type Scheme = keyof typeof TELEGRAM_PALETTES;
type SentEvent = { name: string; params: Record<string, unknown> };
type WindowWithPlatforms = {
  WebApp?: unknown;
  TelegramWebviewProxy?: unknown;
};

const platformWindow = () => window as unknown as WindowWithPlatforms;
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const brightness = (hex: string) => {
  const value = Number.parseInt(hex.slice(1), 16);

  return 0.299 * (value >> 16) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255);
};

/** Модули SDK грузятся заново на каждый тест: его состояние (кнопка, тема) не перетекает между тестами. */
const loadSdk = async () => {
  vi.resetModules();

  return import('@telegram-apps/sdk');
};

type TelegramEnv = { bridge: Bridge; sent: SentEvent[]; press: () => Promise<void> };

const openTelegram = async (scheme: Scheme = 'dark'): Promise<TelegramEnv> => {
  const sdk = await loadSdk();
  const sent: SentEvent[] = [];

  sdk.mockTelegramEnv({
    launchParams: {
      tgWebAppData: TELEGRAM_INIT_DATA,
      tgWebAppVersion: '8.0',
      tgWebAppPlatform: 'web',
      tgWebAppThemeParams: { ...TELEGRAM_PALETTES[scheme] },
    },
    onEvent: (event) => {
      sent.push({ name: event[0], params: (event[1] ?? {}) as Record<string, unknown> });
    },
  });

  const { createTelegramBridge } = await import('@/bridge/telegram');
  const bridge = createTelegramBridge();

  await tick();

  return {
    bridge,
    sent,
    press: async () => {
      sdk.emitEvent('main_button_pressed');
      await tick();
    },
  };
};

const mockSystemScheme = (scheme: Scheme) => {
  vi.stubGlobal(
    'matchMedia',
    (query: string): MediaQueryList =>
      ({
        matches: query.includes('dark') ? scheme === 'dark' : scheme === 'light',
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
};

const openMax = async (scheme: Scheme = 'dark'): Promise<Bridge> => {
  vi.resetModules();
  mockSystemScheme(scheme);
  platformWindow().WebApp = {
    initData: MAX_INIT_DATA,
    initDataUnsafe: { user: { id: 9001, first_name: 'Олег' } },
    platform: 'web',
    version: '1.0',
    BackButton: { show: () => {}, hide: () => {}, onClick: () => {}, offClick: () => {} },
    HapticFeedback: { impactOccurred: () => {} },
  };

  const { createMaxBridge } = await import('@/bridge/max');

  return createMaxBridge();
};

const isShown = (element: Element | null): boolean => {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = window.getComputedStyle(node);

    if (node.hasAttribute('hidden') || style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
  }

  return element !== null;
};

const maxButton = () => document.querySelector<HTMLButtonElement>('button[data-bridge-main-button]');

const lastSetup = (sent: SentEvent[]) => sent.filter(({ name }) => name === 'web_app_setup_main_button').at(-1);

beforeEach(() => {
  window.sessionStorage.clear();
  window.location.hash = '';
  delete platformWindow().TelegramWebviewProxy;
  delete platformWindow().WebApp;
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete platformWindow().TelegramWebviewProxy;
  delete platformWindow().WebApp;
  document.body.innerHTML = '';
});

describe('A1: initData и платформа', () => {
  it('A1 telegram: bridge.initData строго равна исходной строке, platform = telegram', async () => {
    const { bridge } = await openTelegram();

    expect(bridge.initData).toBe(TELEGRAM_INIT_DATA);
    expect(bridge.platform).toBe('telegram');
  });

  it('A1 max: bridge.initData строго равна исходной строке, platform = max', async () => {
    const bridge = await openMax();

    expect(bridge.initData).toBe(MAX_INIT_DATA);
    expect(bridge.platform).toBe('max');
  });
});

describe('A2: тема', () => {
  it.each<Scheme>(['dark', 'light'])(
    'A2 telegram-%s: ключи scheme и colors, bg и button из themeParams',
    async (scheme) => {
      const { bridge } = await openTelegram(scheme);
      const palette = TELEGRAM_PALETTES[scheme];

      expect(Object.keys(bridge.theme).sort()).toEqual(['colors', 'scheme']);
      expect(Object.keys(bridge.theme.colors).sort()).toEqual(COLOR_KEYS);
      Object.values(bridge.theme.colors).forEach((color) => expect(color).toMatch(HEX_COLOR));
      expect(bridge.theme.colors.bg).toBe(palette.bg_color);
      expect(bridge.theme.colors.button).toBe(palette.button_color);
      expect(bridge.theme.scheme).toBe(scheme);
    },
  );

  it.each<Scheme>(['dark', 'light'])('A2 max-%s: scheme системная, цвета набора этой схемы', async (scheme) => {
    const bridge = await openMax(scheme);
    const { bg, text } = bridge.theme.colors;

    expect(Object.keys(bridge.theme).sort()).toEqual(['colors', 'scheme']);
    expect(Object.keys(bridge.theme.colors).sort()).toEqual(COLOR_KEYS);
    Object.values(bridge.theme.colors).forEach((color) => expect(color).toMatch(HEX_COLOR));
    expect(bridge.theme.scheme).toBe(scheme);
    // набор схемы: у темной фон темнее текста, у светлой - светлее
    expect(brightness(bg) < brightness(text)).toBe(scheme === 'dark');
  });
});

describe('A3: главная кнопка', () => {
  it('A3 telegram: показ с текстом, нажатие, отписка, disable, hide', async () => {
    const { bridge, sent, press } = await openTelegram();
    const handler = vi.fn();

    bridge.mainButton.setText('Записаться');
    bridge.mainButton.show();
    await tick();

    expect(lastSetup(sent)?.params).toMatchObject({ text: 'Записаться', is_visible: true });

    const unsubscribe = bridge.mainButton.onClick(handler);

    await press();
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    await press();
    expect(handler).toHaveBeenCalledTimes(1);

    bridge.mainButton.disable();
    await tick();
    expect(lastSetup(sent)?.params).toMatchObject({ is_active: false });

    bridge.mainButton.hide();
    await tick();
    expect(lastSetup(sent)?.params).toMatchObject({ is_visible: false });
  });

  it('A3 max: своя кнопка внизу страницы: текст, клик, отписка, disabled, скрыта', async () => {
    const bridge = await openMax();
    const handler = vi.fn();

    bridge.mainButton.setText('Записаться');
    bridge.mainButton.show();

    const button = maxButton();

    expect(isShown(button)).toBe(true);
    expect(button?.textContent?.trim()).toBe('Записаться');

    const unsubscribe = bridge.mainButton.onClick(handler);

    button?.click();
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    button?.click();
    expect(handler).toHaveBeenCalledTimes(1);

    bridge.mainButton.disable();
    expect(maxButton()?.disabled).toBe(true);

    bridge.mainButton.hide();
    expect(isShown(maxButton())).toBe(false);
  });
});

describe('A4: один формат', () => {
  it('A4: у адаптеров одинаковый набор ключей Bridge, theme.colors и mainButton, значения заполнены', async () => {
    const { bridge: telegram } = await openTelegram();
    const max = await openMax();

    for (const bridge of [telegram, max]) {
      expect(Object.keys(bridge).sort()).toEqual(BRIDGE_KEYS);
      expect(Object.keys(bridge.theme.colors).sort()).toEqual(COLOR_KEYS);
      expect(Object.keys(bridge.mainButton).sort()).toEqual(MAIN_BUTTON_KEYS);
      expect(bridge.initData).not.toBe('');
      Object.values(bridge.theme.colors).forEach((color) => expect(color).toMatch(HEX_COLOR));
    }

    expect(Object.keys(telegram).sort()).toEqual(Object.keys(max).sort());
    expect(Object.keys(telegram.theme.colors).sort()).toEqual(Object.keys(max.theme.colors).sort());
    expect(Object.keys(telegram.mainButton).sort()).toEqual(Object.keys(max.mainButton).sort());
  });
});

const PROGRESS = '[data-bridge-main-button-progress]';
const progressIn = (button: HTMLButtonElement | null) => button?.querySelectorAll(PROGRESS).length ?? 0;

describe('P: индикатор отправки на главной кнопке', () => {
  it('P1 telegram: showProgress/hideProgress с прежним состоянием', async () => {
    const { bridge, sent } = await openTelegram();

    bridge.mainButton.setText('Оформить заказ');
    bridge.mainButton.show();
    bridge.mainButton.disable();
    bridge.mainButton.showProgress();
    await tick();

    expect(lastSetup(sent)?.params).toMatchObject({
      text: 'Оформить заказ',
      is_visible: true,
      is_active: false,
      is_progress_visible: true,
    });

    bridge.mainButton.hideProgress();
    await tick();

    expect(lastSetup(sent)?.params).toMatchObject({
      text: 'Оформить заказ',
      is_visible: true,
      is_active: false,
      is_progress_visible: false,
    });

    // другая пара значений: индикатор не показывает скрытую кнопку и не гасит активную
    bridge.mainButton.enable();
    bridge.mainButton.hide();
    bridge.mainButton.showProgress();
    await tick();

    expect(lastSetup(sent)?.params).toMatchObject({
      text: 'Оформить заказ',
      is_visible: false,
      is_active: true,
      is_progress_visible: true,
    });

    bridge.mainButton.hideProgress();
    await tick();

    expect(lastSetup(sent)?.params).toMatchObject({
      text: 'Оформить заказ',
      is_visible: false,
      is_active: true,
      is_progress_visible: false,
    });
  });

  // поток во время отправки зовет setText/show/disable: событие без индикатора погасило бы его
  it('P1b telegram: прогресс переживает другие изменения кнопки', async () => {
    const { bridge, sent } = await openTelegram();

    bridge.mainButton.setText('Записаться');
    bridge.mainButton.show();
    bridge.mainButton.showProgress();
    bridge.mainButton.enable();
    await tick();

    expect(lastSetup(sent)?.params).toMatchObject({ is_active: true, is_progress_visible: true });

    bridge.mainButton.setText('Оформить заказ');
    await tick();

    expect(lastSetup(sent)?.params).toMatchObject({ text: 'Оформить заказ', is_progress_visible: true });

    bridge.mainButton.hideProgress();
    await tick();

    expect(lastSetup(sent)?.params).toMatchObject({ is_active: true, is_progress_visible: false });
  });

  it.each<['enable' | 'disable', boolean]>([
    ['enable', false],
    ['disable', true],
  ])('P2 max: индикатор и aria-busy, до индикатора %s', async (before, disabledAfter) => {
    const bridge = await openMax();

    bridge.mainButton.setText('Записаться');
    bridge.mainButton.show();
    bridge.mainButton[before]();
    bridge.mainButton.showProgress();

    const button = maxButton();

    expect(button?.getAttribute('aria-busy')).toBe('true');
    expect(button?.disabled).toBe(true);
    expect(progressIn(button)).toBe(1);
    expect(button?.textContent).toContain('Записаться');

    bridge.mainButton.hideProgress();

    expect(progressIn(maxButton())).toBe(0);
    expect(maxButton()?.hasAttribute('aria-busy')).toBe(false);
    expect(maxButton()?.disabled).toBe(disabledAfter);
  });

  // текст пишется в кнопку, а индикатор — ее дочерний элемент: замена текста не должна его снести
  it('P2b max: setText во время индикатора его не стирает', async () => {
    const bridge = await openMax();

    bridge.mainButton.setText('Записаться');
    bridge.mainButton.show();
    bridge.mainButton.showProgress();
    bridge.mainButton.setText('Оформить заказ');

    const button = maxButton();

    expect(progressIn(button)).toBe(1);
    expect(button?.textContent).toContain('Оформить заказ');
    expect(button?.textContent).not.toContain('Записаться');
    expect(button?.getAttribute('aria-busy')).toBe('true');
  });

  // поток при ошибке может позвать enable() до hideProgress(): после снятия кнопка снова нажимается
  it('P2c max: enable/disable во время индикатора', async () => {
    const bridge = await openMax();

    bridge.mainButton.setText('Записаться');
    bridge.mainButton.show();

    bridge.mainButton.disable();
    bridge.mainButton.showProgress();
    bridge.mainButton.enable();

    expect(maxButton()?.disabled).toBe(true);
    expect(maxButton()?.getAttribute('aria-busy')).toBe('true');

    bridge.mainButton.hideProgress();

    expect(maxButton()?.disabled).toBe(false);

    bridge.mainButton.enable();
    bridge.mainButton.showProgress();
    bridge.mainButton.disable();
    bridge.mainButton.hideProgress();

    expect(maxButton()?.disabled).toBe(true);
  });

  it('P2d max: повторные showProgress и hideProgress', async () => {
    const bridge = await openMax();

    bridge.mainButton.setText('Записаться');
    bridge.mainButton.show();
    bridge.mainButton.enable();
    bridge.mainButton.showProgress();
    bridge.mainButton.showProgress();

    expect(progressIn(maxButton())).toBe(1);

    expect(() => {
      bridge.mainButton.hideProgress();
      bridge.mainButton.hideProgress();
    }).not.toThrow();
    expect(progressIn(maxButton())).toBe(0);
    expect(maxButton()?.disabled).toBe(false);

    const fresh = await openMax();

    fresh.mainButton.disable();

    expect(() => fresh.mainButton.hideProgress()).not.toThrow();
    expect(maxButton()?.disabled).toBe(true);
    expect(maxButton()?.hasAttribute('aria-busy')).toBe(false);
  });
});
