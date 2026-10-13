import config from '@payload-config';
import { getPayload, type Payload } from 'payload';
import { DEMO_MASTERS, DEMO_MENU, DEMO_SERVICES } from './seed-data';

const seedSalon = async (payload: Payload): Promise<void> => {
  const [services, masters] = await Promise.all([
    payload.count({ collection: 'services', overrideAccess: true }),
    payload.count({ collection: 'masters', overrideAccess: true }),
  ]);

  if (services.totalDocs > 0 || masters.totalDocs > 0) {
    payload.logger.info('Услуги или мастера уже есть: засев салона пропущен.');

    return;
  }

  const createdServices = new Map<string, number>();

  for (const service of DEMO_SERVICES) {
    const { id } = await payload.create({ collection: 'services', data: service, overrideAccess: true });

    createdServices.set(service.name, id);
  }

  for (const master of DEMO_MASTERS) {
    await payload.create({
      collection: 'masters',
      data: {
        name: master.name,
        services: master.serviceNames.map((name) => createdServices.get(name)!),
        schedule: master.workdays.map((weekday) => ({
          weekday,
          start: master.start,
          end: master.end,
          breaks: [master.lunch],
        })),
      },
      overrideAccess: true,
    });
  }

  payload.logger.info(`Засеяно: услуг ${DEMO_SERVICES.length}, мастеров ${DEMO_MASTERS.length}.`);
};

/** Меню засевается отдельно от салона: экземпляр кофейни услуг и мастеров не держит. */
const seedMenu = async (payload: Payload): Promise<void> => {
  const { totalDocs } = await payload.count({ collection: 'menu-items', overrideAccess: true });

  if (totalDocs > 0) {
    payload.logger.info('Меню уже есть: засев меню пропущен.');

    return;
  }

  for (const item of DEMO_MENU) {
    await payload.create({ collection: 'menu-items', data: { ...item }, overrideAccess: true });
  }

  payload.logger.info(`Засеяно позиций меню: ${DEMO_MENU.length}.`);
};

const seed = async (): Promise<void> => {
  const payload = await getPayload({ config });

  await seedSalon(payload);
  await seedMenu(payload);
  await payload.destroy();
};

await seed();
