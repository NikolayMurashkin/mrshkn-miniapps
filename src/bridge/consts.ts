import type { BridgeColors, BridgeTheme, TelegramLaunch } from './types';

export const MAX_BRIDGE_SCRIPT_URL = 'https://st.max.ru/js/max-web-app.js';
export const MAIN_BUTTON_ATTRIBUTE = 'data-bridge-main-button';
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export const EMPTY_LAUNCH: TelegramLaunch = { initData: '', themeParams: {} };

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;
export const RED_WEIGHT = 0.299;
export const GREEN_WEIGHT = 0.587;
export const BLUE_WEIGHT = 0.114;

export const LIGHT_COLORS: BridgeColors = {
  bg: '#ffffff',
  text: '#1a1a1a',
  hint: '#7a7f87',
  link: '#2678b6',
  button: '#2678b6',
  buttonText: '#ffffff',
  secondaryBg: '#f1f2f4',
};

export const DARK_COLORS: BridgeColors = {
  bg: '#17212b',
  text: '#f5f5f5',
  hint: '#8a97a6',
  link: '#6ab3f3',
  button: '#5288c1',
  buttonText: '#ffffff',
  secondaryBg: '#232e3c',
};

export const LIGHT_THEME: BridgeTheme = { scheme: 'light', colors: LIGHT_COLORS };
export const DARK_THEME: BridgeTheme = { scheme: 'dark', colors: DARK_COLORS };
