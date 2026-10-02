import { postgresAdapter } from '@payloadcms/db-postgres';
import { ru } from '@payloadcms/translations/languages/ru';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfig } from 'payload';
import { Bookings } from './cms/collections/Bookings';
import { Clients } from './cms/collections/Clients';
import { Masters } from './cms/collections/Masters';
import { Reminders } from './cms/collections/Reminders';
import { Services } from './cms/collections/Services';
import { Users } from './cms/collections/Users';
import { Settings } from './cms/globals/Settings';
import { tickTask } from './jobs/tick-task';
import { TICK_CRON, TICK_QUEUE } from './lib/consts';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: dirname },
    meta: { titleSuffix: ' · Запись' },
  },
  collections: [Users, Services, Masters, Clients, Bookings, Reminders],
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI },
    migrationDir: path.resolve(dirname, 'migrations'),
  }),
  globals: [Settings],
  graphQL: { disable: true },
  i18n: { fallbackLanguage: 'ru', supportedLanguages: { ru } },
  jobs: { tasks: [tickTask], autoRun: [{ cron: TICK_CRON, queue: TICK_QUEUE }] },
  secret: process.env.PAYLOAD_SECRET ?? '',
  telemetry: false,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
});
