import config from '@payload-config';
import type {} from '@payloadcms/db-postgres';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getPayload, type Payload } from 'payload';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let payload: Payload;

beforeAll(async () => {
  payload = await getPayload({ config });
});

afterAll(async () => {
  await payload.destroy();
});

/**
 * Схему базы экземпляра создают миграции, а в разработке и тестах Payload накатывает ее сам. Поле, добавленное
 * в коллекцию без миграции, в тестах работает, а на стенде падает на первом запросе. Тест сравнивает то же, что
 * `payload migrate:create`: снимок последней миграции со схемой из конфига.
 */
describe('миграции', () => {
  it('схема из миграций совпадает со схемой конфига — иначе `yarn payload migrate:create <имя>`', async () => {
    const { generateDrizzleJson, generateMigration } = payload.db.requireDrizzleKit();
    const directory = payload.db.migrationDir;
    const snapshots = existsSync(directory)
      ? readdirSync(directory)
          .filter((file) => file.endsWith('.json'))
          .sort()
      : [];
    const latest = snapshots.at(-1);
    const before = latest
      ? JSON.parse(readFileSync(path.join(directory, latest), 'utf8'))
      : payload.db.defaultDrizzleSnapshot;

    const statements = await generateMigration(before, await generateDrizzleJson(payload.db.schema));

    expect(statements).toEqual([]);
  });
});
