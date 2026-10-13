import { describe, expect, it } from 'vitest';
import { viewport } from '@/app/(miniapp)/layout';
import { DARK_COLORS, LIGHT_COLORS } from '@/bridge/consts';

/** Цвета фона из адаптеров bridge: светлая и темная тема, что и у экранов до загрузки темы платформы. */
const LIGHT_BG = '#ffffff';
const DARK_BG = '#17212b';

describe('viewport корневого layout Mini App («Запись» и «Лояльность»)', () => {
  it('V1 colorScheme — light dark', () => {
    expect(viewport.colorScheme).toBe('light dark');
  });

  it('V2 themeColor — светлый и темный фон по prefers-color-scheme', () => {
    expect(viewport.themeColor).toEqual([
      { media: '(prefers-color-scheme: light)', color: LIGHT_BG },
      { media: '(prefers-color-scheme: dark)', color: DARK_BG },
    ]);
    expect([LIGHT_COLORS.bg, DARK_COLORS.bg]).toEqual([LIGHT_BG, DARK_BG]);
  });

  it('V3 width и initialScale на месте', () => {
    expect(viewport.width).toBe('device-width');
    expect(viewport.initialScale).toBe(1);
  });

  it('V4 layout «Лояльности» своего viewport не задает и корневой не перекрывает', async () => {
    const loyaltyLayout = (await import('@/app/(miniapp)/loyalty/layout')) as Record<string, unknown>;

    expect(Object.keys(loyaltyLayout)).not.toContain('viewport');
  });
});
