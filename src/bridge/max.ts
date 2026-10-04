import { DARK_SCHEME_QUERY, DARK_THEME, LIGHT_THEME, MAIN_BUTTON_ATTRIBUTE, MAX_BRIDGE_SCRIPT_URL } from './consts';
import type { Bridge, BridgeColors, MainButton, WindowWithMax } from './types';

const readInitData = (): string => (window as unknown as WindowWithMax).WebApp?.initData ?? '';

const readTheme = () => (window.matchMedia(DARK_SCHEME_QUERY).matches ? DARK_THEME : LIGHT_THEME);

const applyColors = (button: HTMLButtonElement, colors: BridgeColors) => {
  Object.assign(button.style, {
    position: 'fixed',
    left: '0',
    right: '0',
    bottom: '0',
    width: '100%',
    minHeight: '52px',
    padding: '14px 16px calc(14px + env(safe-area-inset-bottom))',
    border: '0',
    font: '600 16px/1.2 system-ui, sans-serif',
    background: colors.button,
    color: colors.buttonText,
    zIndex: '10',
  });
};

/** MAX Bridge не знает главной кнопки: рисуем свою, прилипшую к низу страницы. */
const createMainButton = (colors: BridgeColors): MainButton => {
  document.querySelectorAll(`button[${MAIN_BUTTON_ATTRIBUTE}]`).forEach((stale) => stale.remove());

  const button = document.createElement('button');

  button.type = 'button';
  button.setAttribute(MAIN_BUTTON_ATTRIBUTE, '');
  button.hidden = true;
  applyColors(button, colors);
  document.body.append(button);

  return {
    setText: (text) => {
      button.textContent = text;
    },
    show: () => {
      button.hidden = false;
    },
    hide: () => {
      button.hidden = true;
    },
    enable: () => {
      button.disabled = false;
      button.style.opacity = '1';
    },
    disable: () => {
      button.disabled = true;
      button.style.opacity = '0.6';
    },
    onClick: (handler) => {
      button.addEventListener('click', handler);

      return () => button.removeEventListener('click', handler);
    },
  };
};

export const createMaxBridge = (): Bridge => {
  const theme = readTheme();

  return {
    platform: 'max',
    initData: readInitData(),
    theme,
    mainButton: createMainButton(theme.colors),
  };
};

const appendScript = () =>
  new Promise<void>((resolve) => {
    const script = document.createElement('script');

    script.src = MAX_BRIDGE_SCRIPT_URL;
    // без скрипта initData пуст: API ответит 401, экран покажет «Откройте запись из чата с ботом»
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.append(script);
  });

/** Страница MAX грузит скрипт Bridge сама и только здесь, затем создает адаптер. */
export const loadMaxBridge = async (): Promise<Bridge> => {
  if (!(window as unknown as WindowWithMax).WebApp) {
    await appendScript();
  }

  return createMaxBridge();
};
