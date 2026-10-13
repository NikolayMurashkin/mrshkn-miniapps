import { afterEach, describe, expect, it, vi } from 'vitest';

const DEFAULT_SUFFIX = ' · Mini App';

/** Конфиг Payload собирается при импорте: каждый тест грузит его заново под своим окружением. */
const titleSuffixWith = async (adminTitle: string | undefined): Promise<unknown> => {
  vi.stubEnv('ADMIN_TITLE', adminTitle);
  vi.resetModules();

  const config = await (await import('@/payload.config')).default;

  return config.admin.meta.titleSuffix;
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('суффикс заголовка админки из окружения экземпляра', () => {
  it('T1 ADMIN_TITLE=Кофейня: titleSuffix « · Кофейня»', async () => {
    expect(await titleSuffixWith('Кофейня')).toBe(' · Кофейня');
  });

  it('T2 ADMIN_TITLE не задана: titleSuffix « · Mini App», «Запись» в нем нет', async () => {
    const suffix = await titleSuffixWith(undefined);

    expect(suffix).toBe(DEFAULT_SUFFIX);
    expect(String(suffix)).not.toContain('Запись');
  });

  it('T3 ADMIN_TITLE из пробелов — умолчание, вокруг названия пробелы обрезаются', async () => {
    expect(await titleSuffixWith('   ')).toBe(DEFAULT_SUFFIX);
    expect(await titleSuffixWith('  Кофейня  ')).toBe(' · Кофейня');
  });
});
