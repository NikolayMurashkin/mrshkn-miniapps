import { Client } from 'pg';

/**
 * Схема тестовой базы пересоздается перед каждым прогоном: Payload в режиме разработки сам накатывает таблицы,
 * а на старой схеме спросил бы в терминале, можно ли терять данные, и прогон бы повис.
 */
const resetTestDatabase = async () => {
  const url = process.env.DATABASE_URI ?? '';

  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(
      `интеграционные тесты стирают базу, а ${url} не похожа на тестовую (имя должно кончаться на _test)`,
    );
  }

  const client = new Client({ connectionString: url });

  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await client.end();
};

export default resetTestDatabase;
