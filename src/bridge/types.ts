import type { PLATFORMS } from '@/lib/consts';

export type BridgePlatform = (typeof PLATFORMS)[number];

export type BridgeColors = {
  bg: string;
  text: string;
  hint: string;
  link: string;
  button: string;
  buttonText: string;
  secondaryBg: string;
};

export type BridgeTheme = {
  scheme: 'light' | 'dark';
  colors: BridgeColors;
};

export type MainButton = {
  setText(text: string): void;
  show(): void;
  hide(): void;
  enable(): void;
  disable(): void;
  /** Индикатор отправки на кнопке. */
  showProgress(): void;
  hideProgress(): void;
  /** Возвращает отписку. */
  onClick(handler: () => void): () => void;
};

/** Индикатор на своей кнопке MAX и его анимация (без Web Animations API ее нет). */
export type MaxProgress = { indicator: HTMLSpanElement; animation: Animation | undefined };

export type Bridge = {
  platform: BridgePlatform;
  initData: string;
  theme: BridgeTheme;
  mainButton: MainButton;
  /** Сканер QR платформы; null — сканер закрыли, он недоступен или упал. */
  scanQr(): Promise<string | null>;
};

export type TelegramThemeParams = Record<string, string | undefined>;
export type TelegramLaunch = { initData: string; themeParams: TelegramThemeParams };

export type MaxWebApp = { initData?: string; openCodeReader?: (fileSelect?: boolean) => Promise<unknown> };
export type WindowWithMax = { WebApp?: MaxWebApp };
