// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildInitData } from '../helpers/sign-init-data';

const TELEGRAM_INIT_DATA = buildInitData({
  botToken: '123456:TG-bridge-token',
  user: { id: 515151, first_name: 'Вера' },
  authDate: new Date('2030-03-12T11:59:00.000Z'),
  extra: { query_id: 'AAH-test', signature: 'sig_test-1' },
});
const MAX_INIT_DATA = buildInitData({
  botToken: 'max-bridge-token',
  user: { id: 909090, first_name: 'Вера' },
  authDate: new Date('2030-03-12T11:59:00.000Z'),
});

type SentEvent = { name: string; params: Record<string, unknown> };
/** Сканер появится в интерфейсе Bridge вместе с реализацией: тест видит его через свой тип. */
type ScanBridge = { scanQr?: unknown };
type ScanQr = () => Promise<string | null>;
type WindowWithPlatforms = { WebApp?: unknown; TelegramWebviewProxy?: unknown };

const platformWindow = () => window as unknown as WindowWithPlatforms;
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** scanQr обязан быть функцией адаптера: без него тест падает на assert, а не на TypeError. */
const scannerOf = (bridge: unknown): ScanQr => {
  const scanQr = (bridge as ScanBridge).scanQr;

  expect(typeof scanQr, 'у адаптера нет scanQr()').toBe('function');

  return (scanQr as ScanQr).bind(bridge);
};

/** Подставной хост Telegram: SDK грузится заново на каждый тест, события клиента пишутся в sent. */
const openTelegram = async () => {
  vi.resetModules();

  const sdk = await import('@telegram-apps/sdk');
  const sent: SentEvent[] = [];

  sdk.mockTelegramEnv({
    launchParams: {
      tgWebAppData: TELEGRAM_INIT_DATA,
      tgWebAppVersion: '8.0',
      tgWebAppPlatform: 'web',
      tgWebAppThemeParams: {},
    },
    onEvent: (event) => {
      sent.push({ name: event[0], params: (event[1] ?? {}) as Record<string, unknown> });
    },
  });

  const { createTelegramBridge } = await import('@/bridge/telegram');
  const bridge = createTelegramBridge();

  await tick();

  return { bridge, sent, sdk };
};

const openMax = async (openCodeReader: (fileSelect: boolean) => Promise<string>) => {
  vi.resetModules();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  platformWindow().WebApp = {
    initData: MAX_INIT_DATA,
    initDataUnsafe: { user: { id: 909090, first_name: 'Вера' } },
    platform: 'web',
    version: '1.0',
    BackButton: { show: () => {}, hide: () => {}, onClick: () => {}, offClick: () => {} },
    HapticFeedback: { impactOccurred: () => {} },
    openCodeReader,
  };

  const { createMaxBridge } = await import('@/bridge/max');

  return createMaxBridge();
};

const names = (sent: SentEvent[]) => sent.map(({ name }) => name);

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

describe('сканер QR кассира в bridge', () => {
  it('B1 telegram: открывает сканер, qr_text_received отдает строку и закрывает сканер, закрытие сканера — null', async () => {
    const { bridge, sent, sdk } = await openTelegram();
    const scanQr = scannerOf(bridge);

    const scanned = scanQr();

    await tick();
    expect(names(sent)).toContain('web_app_open_scan_qr_popup');
    expect(names(sent)).not.toContain('web_app_close_scan_qr_popup');

    sdk.emitEvent('qr_text_received', { data: 'tok' });

    await expect(scanned).resolves.toBe('tok');
    await tick();
    expect(names(sent)).toContain('web_app_close_scan_qr_popup');

    const opensBefore = names(sent).filter((name) => name === 'web_app_open_scan_qr_popup').length;
    const closed = scanQr();

    await tick();
    expect(names(sent).filter((name) => name === 'web_app_open_scan_qr_popup')).toHaveLength(opensBefore + 1);

    sdk.emitEvent('scan_qr_popup_closed');

    await expect(closed).resolves.toBeNull();
  });

  it('B1 max: openCodeReader(false), резолв строки — строка, отказ — null', async () => {
    const reader = vi.fn<(fileSelect: boolean) => Promise<string>>(async () => 'tok');
    const scanQr = scannerOf(await openMax(reader));

    await expect(scanQr()).resolves.toBe('tok');
    expect(reader).toHaveBeenCalledWith(false);

    reader.mockRejectedValueOnce(new Error('сканер закрыт'));

    await expect(scanQr()).resolves.toBeNull();
  });
});
