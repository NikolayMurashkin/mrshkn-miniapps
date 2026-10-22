import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FAVICON_PATH = fileURLToPath(new URL('../../src/app/favicon.ico', import.meta.url));
const SITE_FAVICON_PATH = fileURLToPath(new URL('../../../site/src/app/favicon.ico', import.meta.url));

/**
 * sha256 `site/src/app/favicon.ico` на 22.10.2026: знак MRSHKN, 1636 байт, ICO из трех PNG 16, 32 и 48 px.
 * Экземпляр отдает тот же знак, что сайт. На CI сайта рядом нет → сверка идет по этому хешу.
 * Сменили знак на сайте → обновить оба файла и эту константу.
 */
const SITE_FAVICON_SHA256 = '66c91131f74e65da1a3fbb1e13b9ff2643c5d04ca216a5556d8dea312f3bb066';

const ICO_HEADER_SIZE = 6;
const ICO_ENTRY_SIZE = 16;
const ICO_TYPE_ICON = 1;

/** Сначала наличие — понятным провалом assert, а не ENOENT чтения. */
const readFavicon = (): Buffer => {
  expect(existsSync(FAVICON_PATH), 'src/app/favicon.ico нет — /favicon.ico экземпляра отдаст 404').toBe(true);

  return readFileSync(FAVICON_PATH);
};

describe('favicon.ico экземпляра Mini App — знак MRSHKN, как у сайта', () => {
  it('S1 файл есть', () => {
    expect(existsSync(FAVICON_PATH), 'src/app/favicon.ico нет — /favicon.ico экземпляра отдаст 404').toBe(true);
  });

  it('S2 это ICO с изображениями 16, 32 и 48 px', () => {
    const bytes = readFavicon();

    expect(bytes.length).toBeGreaterThanOrEqual(ICO_HEADER_SIZE);

    const reserved = bytes.readUInt16LE(0);
    const type = bytes.readUInt16LE(2);
    const count = bytes.readUInt16LE(4);

    expect(reserved).toBe(0);
    expect(type).toBe(ICO_TYPE_ICON);
    expect(bytes.length).toBeGreaterThanOrEqual(ICO_HEADER_SIZE + ICO_ENTRY_SIZE * count);

    const sizes = new Set<number>();

    for (let i = 0; i < count; i += 1) {
      const offset = ICO_HEADER_SIZE + ICO_ENTRY_SIZE * i;
      // 0 в байте размера — 256 px
      const width = bytes[offset] || 256;
      const height = bytes[offset + 1] || 256;

      expect(height, `изображение ${i} не квадратное: ${width}×${height}`).toBe(width);
      sizes.add(width);
    }

    expect([...sizes]).toEqual(expect.arrayContaining([16, 32, 48]));
  });

  it('S3 побайтно равен знаку сайта — по записанному sha256 (как на CI)', () => {
    const bytes = readFavicon();

    expect(createHash('sha256').update(bytes).digest('hex')).toBe(SITE_FAVICON_SHA256);
  });

  // На CI в checkout только miniapps → сценарий пропущен, покрытие дает S3.
  it.runIf(existsSync(SITE_FAVICON_PATH))(
    'S4 побайтно равен ../site/src/app/favicon.ico, когда сайт лежит рядом (локально)',
    () => {
      const miniappsBytes = readFavicon();
      const siteBytes = readFileSync(SITE_FAVICON_PATH);

      expect(miniappsBytes.equals(siteBytes)).toBe(true);
    },
  );
});
