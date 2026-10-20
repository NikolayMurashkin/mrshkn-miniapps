import type { Payload } from 'payload';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest';
import { migrations } from '@/migrations';

/**
 * Новый экземпляр: пустая база, ни одного запроса к Mini App. Подъем при старте процесса сам применяет все миграции
 * из образа — первая запись не ждет, пока кто-то откроет админку. Окружение как на сервере: `MIGRATE_ON_START=true`
 * и `NODE_ENV=production` (адаптер Postgres гоняет миграции при старте только при нем и не накатывает схему сам).
 * Модули приложения грузятся после смены окружения: конфиг читает флаг миграций при загрузке.
 */

process.env.MIGRATE_ON_START = 'true';
(process.env as Record<string, string>).NODE_ENV = 'production';
process.env.NEXT_RUNTIME = 'nodejs';
delete process.env.NEXT_PHASE;

type PayloadCache = Map<string, { payload: Payload | null }>;

let client: Client;
let exit: MockInstance<typeof process.exit>;

const resetSchema = () => client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');

/** Имена из журнала миграций; журнала нет — миграции не шли вовсе. */
const appliedMigrations = async () => {
  const { rows } = await client.query<{ exists: boolean }>(
    `SELECT to_regclass('public.payload_migrations') IS NOT NULL AS exists`,
  );

  if (!rows[0].exists) {
    return [];
  }

  return (await client.query<{ name: string }>('SELECT name FROM payload_migrations')).rows.map(({ name }) => name);
};

/** Экземпляр, который поднял подъем при старте, — из кеша getPayload, без нового подъема (иначе cron пойдет дальше). */
const startedPayload = () =>
  (globalThis as unknown as { _payload?: PayloadCache })._payload?.get('default')?.payload ?? null;

beforeAll(async () => {
  const url = process.env.DATABASE_URI ?? '';

  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(`тест стирает базу, а ${url} не похожа на тестовую (имя должно кончаться на _test)`);
  }

  client = new Client({ connectionString: url });
  await client.connect();
  await resetSchema();

  exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
});

/** Схема стирается и после: иначе следующий файл получит строки журнала миграций, и push спросит в терминале. */
afterAll(async () => {
  await startedPayload()?.destroy();
  await resetSchema();
  await client.end();
  exit.mockRestore();
});

describe('подъем Payload при старте на пустой базе', () => {
  it('M1: register() без единого запроса — все миграции в журнале, таблица записей из миграций', async () => {
    const { register } = await import('@/instrumentation');

    await register();

    expect(await appliedMigrations(), 'payload_migrations после подъема').toEqual(
      expect.arrayContaining(migrations.map(({ name }) => name)),
    );

    const table = await client.query<{ exists: boolean }>(
      `SELECT to_regclass('public.bookings') IS NOT NULL AS exists`,
    );

    expect(table.rows[0].exists, 'таблица bookings после подъема').toBe(true);
  }, 120_000);

  it('M2: подъем прошел без выхода процесса', () => {
    expect(exit).not.toHaveBeenCalled();
  });
});
