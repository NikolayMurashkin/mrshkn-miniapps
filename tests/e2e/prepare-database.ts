import { Client } from 'pg';
import { TEST_DATABASE_URI } from './consts.ts';

/**
 * Схема тестовой базы пересоздается перед каждым прогоном, чтобы запись и клиенты прошлого прогона не мешали;
 * таблицы накатывает `yarn seed` (Payload в режиме разработки сам создает схему) и сразу засевает демо-салон.
 */
const resetSchema = async () => {
  if (!new URL(TEST_DATABASE_URI).pathname.endsWith('_test')) {
    throw new Error(`e2e стирает базу, а ${TEST_DATABASE_URI} не похожа на тестовую (имя должно кончаться на _test)`);
  }

  const client = new Client({ connectionString: TEST_DATABASE_URI });

  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await client.end();
};

await resetSchema();
