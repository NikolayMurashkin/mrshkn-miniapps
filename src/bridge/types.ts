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
  /** Возвращает отписку. */
  onClick(handler: () => void): () => void;
};

export type Bridge = {
  platform: BridgePlatform;
  initData: string;
  theme: BridgeTheme;
  mainButton: MainButton;
};

export type TelegramThemeParams = Record<string, string | undefined>;
export type TelegramLaunch = { initData: string; themeParams: TelegramThemeParams };

export type MaxWebApp = { initData?: string };
export type WindowWithMax = { WebApp?: MaxWebApp };
