import config from '@payload-config';
import { getPayload } from 'payload';
import { DEMO_MASTERS, DEMO_SERVICES } from './seed-data';

const seed = async (): Promise<void> => {
  const payload = await getPayload({ config });
  const [services, masters] = await Promise.all([
    payload.count({ collection: 'services', overrideAccess: true }),
    payload.count({ collection: 'masters', overrideAccess: true }),
  ]);

  if (services.totalDocs > 0 || masters.totalDocs > 0) {
    payload.logger.info('Услуги или мастера уже есть: засев пропущен.');
    await payload.destroy();

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
  await payload.destroy();
};

await seed();
