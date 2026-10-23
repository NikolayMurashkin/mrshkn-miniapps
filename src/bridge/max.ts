import {
  DARK_SCHEME_QUERY,
  DARK_THEME,
  LIGHT_THEME,
  MAIN_BUTTON_ATTRIBUTE,
  MAIN_BUTTON_PROGRESS_ATTRIBUTE,
  MAX_BRIDGE_SCRIPT_URL,
  PROGRESS_PULSE_KEYFRAMES,
  PROGRESS_PULSE_TIMING,
  PROGRESS_SPIN_KEYFRAMES,
  PROGRESS_SPIN_TIMING,
  REDUCED_MOTION_QUERY,
} from './consts';
import type { Bridge, BridgeColors, MainButton, MaxProgress, WindowWithMax } from './types';

const readInitData = (): string => (window as unknown as WindowWithMax).WebApp?.initData ?? '';

/** Камера MAX без выбора файла из галереи: кассир сканирует экран гостя. */
const scanQr = async (): Promise<string | null> => {
  const reader = (window as unknown as WindowWithMax).WebApp?.openCodeReader;

  if (!reader) {
    return null;
  }

  try {
    const value = await reader(false);

    return typeof value === 'string' && value !== '' ? value : null;
  } catch {
    return null;
  }
};

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

/** Кольцо слева от текста; цвет — цвет текста кнопки, один сегмент прозрачный — видно вращение. */
const createProgressIndicator = (): HTMLSpanElement => {
  const indicator = document.createElement('span');

  indicator.setAttribute(MAIN_BUTTON_PROGRESS_ATTRIBUTE, '');
  indicator.setAttribute('aria-hidden', 'true');
  Object.assign(indicator.style, {
    display: 'inline-block',
    boxSizing: 'border-box',
    width: '16px',
    height: '16px',
    marginRight: '8px',
    border: '2px solid currentColor',
    borderTopColor: 'transparent',
    borderRadius: '50%',
    verticalAlign: 'middle',
  });

  return indicator;
};

/** Без Web Animations API (старый WebView) кольцо стоит на месте: кнопка все равно выключена и занята. */
const animateProgressIndicator = (indicator: HTMLSpanElement): Animation | undefined =>
  window.matchMedia(REDUCED_MOTION_QUERY).matches
    ? indicator.animate?.(PROGRESS_PULSE_KEYFRAMES, PROGRESS_PULSE_TIMING)
    : indicator.animate?.(PROGRESS_SPIN_KEYFRAMES, PROGRESS_SPIN_TIMING);

/** MAX Bridge не знает главной кнопки: рисуем свою, прилипшую к низу страницы. */
const createMainButton = (colors: BridgeColors): MainButton => {
  document.querySelectorAll(`button[${MAIN_BUTTON_ATTRIBUTE}]`).forEach((stale) => stale.remove());

  const button = document.createElement('button');
  // текст — в своем элементе: замена текста не стирает индикатор рядом
  const label = document.createElement('span');
  // enable/disable во время индикатора только запоминаются: снятый индикатор возвращает последнее
  let enabled = true;
  let progress: MaxProgress | null = null;

  const applyEnabled = (value: boolean) => {
    button.disabled = !value;
    button.style.opacity = value ? '1' : '0.6';
  };
  const setEnabled = (value: boolean) => {
    enabled = value;

    if (!progress) {
      applyEnabled(value);
    }
  };

  button.type = 'button';
  button.setAttribute(MAIN_BUTTON_ATTRIBUTE, '');
  button.hidden = true;
  applyColors(button, colors);
  button.append(label);
  document.body.append(button);

  return {
    setText: (text) => {
      label.textContent = text;
    },
    show: () => {
      button.hidden = false;
    },
    hide: () => {
      button.hidden = true;
    },
    enable: () => setEnabled(true),
    disable: () => setEnabled(false),
    showProgress: () => {
      if (progress) {
        return;
      }

      const indicator = createProgressIndicator();

      button.prepend(indicator);
      progress = { indicator, animation: animateProgressIndicator(indicator) };
      button.setAttribute('aria-busy', 'true');
      applyEnabled(false);
    },
    hideProgress: () => {
      if (!progress) {
        return;
      }

      progress.animation?.cancel();
      progress.indicator.remove();
      progress = null;
      button.removeAttribute('aria-busy');
      applyEnabled(enabled);
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
    scanQr,
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
