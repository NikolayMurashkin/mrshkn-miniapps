// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bridge } from '@/bridge/types';
import { LoyaltyApp } from '@/loyalty/LoyaltyApp';
import { buildInitData } from '../helpers/sign-init-data';

/** Сканер Telegram, который не ответил, закрывается через минуту. */
const SCAN_TIMEOUT_MS = 60_000;
const OPEN = 'web_app_open_scan_qr_popup';
const CLOSE = 'web_app_close_scan_qr_popup';
const SCAN_TEXT = 'Сканировать QR';
const SCANNING_TEXT = 'Сканер открыт…';

const TELEGRAM_INIT_DATA = buildInitData({
  botToken: '123456:TG-bridge-token',
  user: { id: 515151, first_name: 'Вера' },
  authDate: new Date('2030-03-12T11:59:00.000Z'),
  extra: { query_id: 'AAH-test', signature: 'sig_test-1' },
});

type SentEvent = { name: string; params: Record<string, unknown> };
type WindowWithPlatforms = { WebApp?: unknown; TelegramWebviewProxy?: unknown };
type ApiCall = { path: string; method: string };

const platformWindow = () => window as unknown as WindowWithPlatforms;
/** SDK последнего теста: сканер, оставшийся открытым, закрывается после теста, иначе его подписка поймает события следующего. */
let lastSdk: { emitEvent: (name: 'scan_qr_popup_closed') => void } | null = null;
const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
const count = (sent: SentEvent[], name: string) => sent.filter((event) => event.name === name).length;

/** Подставной хост Telegram: SDK грузится заново, события клиента пишутся в sent; на открытие сканера хост молчит. */
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

  lastSdk = sdk as unknown as typeof lastSdk;

  const { createTelegramBridge } = await import('@/bridge/telegram');
  const bridge: Bridge = createTelegramBridge();

  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  return { bridge, sent, sdk };
};

const fakeScanTimers = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

/** Состояние промиса без ожидания: 'pending', пока он не завершен. */
const track = <T,>(promise: Promise<T>) => {
  const state: { settled: boolean; value?: T; error?: unknown } = { settled: false };

  promise.then(
    (value) => Object.assign(state, { settled: true, value }),
    (error: unknown) => Object.assign(state, { settled: true, error }),
  );

  return state;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Мок fetch кассира: /loyalty/me — кассир, заказы — пустой список; журнал запросов. */
const mockStaffApi = () => {
  const calls: ApiCall[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        'http://app.test',
      );

      calls.push({ path: url.pathname, method: (init?.method ?? 'GET').toUpperCase() });

      if (url.pathname === '/api/miniapp/loyalty/me') {
        return json({ role: 'staff', name: 'Вера' });
      }

      if (url.pathname === '/api/miniapp/staff/orders') {
        return json({ orders: [], timeZone: 'Europe/Kaliningrad' });
      }

      return json({ error: 'not found' }, 404);
    }),
  );

  return calls;
};

/** Экран кассира на настоящем адаптере Telegram; часы подменяются, когда экран уже загружен. */
const renderStaff = async () => {
  const { bridge, sent } = await openTelegram();
  const calls = mockStaffApi();

  render(<LoyaltyApp bridge={bridge} />);
  await screen.findByRole('button', { name: SCAN_TEXT });
  fakeScanTimers();

  return { sent, calls, button: () => screen.getByRole('button', { name: /Сканер|Сканировать/ }) };
};

/** Кассир жмет «Сканировать QR», хост молчит, проходит таймаут. */
const scanUntilTimeout = async () => {
  const staff = await renderStaff();

  fireEvent.click(staff.button());
  await flush();

  expect(count(staff.sent, OPEN)).toBe(1);
  expect(staff.button().textContent).toBe(SCANNING_TEXT);
  expect((staff.button() as HTMLButtonElement).disabled).toBe(true);

  await act(() => vi.advanceTimersByTimeAsync(SCAN_TIMEOUT_MS));

  return staff;
};

beforeEach(() => {
  window.sessionStorage.clear();
  window.location.hash = '';
  delete platformWindow().TelegramWebviewProxy;
  delete platformWindow().WebApp;
  document.body.innerHTML = '';
});

afterEach(() => {
  cleanup();
  lastSdk?.emitEvent('scan_qr_popup_closed');
  lastSdk = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete platformWindow().TelegramWebviewProxy;
  delete platformWindow().WebApp;
  document.body.innerHTML = '';
});

describe('таймаут сканера QR в Telegram', () => {
  it('S1 хост молчит: до таймаута промис висит, на таймауте — null и закрытие сканера; таймаут — 60 с', async () => {
    const consts = (await import('@/bridge/consts')) as Record<string, unknown>;

    expect(consts.SCAN_QR_TIMEOUT_MS).toBe(SCAN_TIMEOUT_MS);

    const { bridge, sent } = await openTelegram();

    fakeScanTimers();

    const scan = track(bridge.scanQr());

    await vi.advanceTimersByTimeAsync(0);
    expect(count(sent, OPEN)).toBe(1);

    await vi.advanceTimersByTimeAsync(SCAN_TIMEOUT_MS - 1);
    expect(scan.settled).toBe(false);
    expect(count(sent, CLOSE)).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(scan).toEqual({ settled: true, value: null });
    expect(count(sent, CLOSE)).toBe(1);
  });

  it('S2 ответ хоста после таймаута ничего не меняет: второго закрытия нет, исключения нет', async () => {
    const { bridge, sent, sdk } = await openTelegram();

    fakeScanTimers();

    const scan = track(bridge.scanQr());

    await vi.advanceTimersByTimeAsync(SCAN_TIMEOUT_MS);
    expect(scan).toEqual({ settled: true, value: null });
    expect(count(sent, CLOSE)).toBe(1);

    expect(() => sdk.emitEvent('qr_text_received', { data: 'late-token' })).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);

    expect(count(sent, CLOSE)).toBe(1);
    expect(scan).toEqual({ settled: true, value: null });
  });

  it('S3 ответ до таймаута — прежний контракт: строка или null, лишнего закрытия после 60 с нет', async () => {
    const { bridge, sent, sdk } = await openTelegram();

    fakeScanTimers();

    const scanned = track(bridge.scanQr());

    await vi.advanceTimersByTimeAsync(10_000);
    sdk.emitEvent('qr_text_received', { data: 'tok' });
    await vi.advanceTimersByTimeAsync(0);
    expect(scanned).toEqual({ settled: true, value: 'tok' });
    expect(count(sent, CLOSE)).toBe(1);

    await vi.advanceTimersByTimeAsync(SCAN_TIMEOUT_MS);
    expect(count(sent, CLOSE)).toBe(1);

    const closed = track(bridge.scanQr());

    await vi.advanceTimersByTimeAsync(10_000);
    sdk.emitEvent('scan_qr_popup_closed');
    await vi.advanceTimersByTimeAsync(0);
    expect(closed).toEqual({ settled: true, value: null });
    expect(count(sent, CLOSE)).toBe(1);

    await vi.advanceTimersByTimeAsync(SCAN_TIMEOUT_MS);
    expect(count(sent, CLOSE)).toBe(1);
  });

  it('S4 кассир: «Сканер открыт…» и неактивна, после таймаута снова «Сканировать QR», без ошибки и без скана', async () => {
    const { calls, button } = await scanUntilTimeout();

    expect(button().textContent).toBe(SCAN_TEXT);
    expect((button() as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(calls.filter((call) => call.path === '/api/miniapp/staff/scan')).toEqual([]);
  });

  it('S5 после таймаута кассир снова жмет «Сканировать QR» — сканер открывается второй раз', async () => {
    const { sent, button } = await scanUntilTimeout();

    fireEvent.click(button());
    await flush();

    expect(count(sent, OPEN)).toBe(2);
    expect(button().textContent).toBe(SCANNING_TEXT);
    expect((button() as HTMLButtonElement).disabled).toBe(true);
  });
});
