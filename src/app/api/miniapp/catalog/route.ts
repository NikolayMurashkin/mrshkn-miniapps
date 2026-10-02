import { getPayload } from 'payload';
import config from '@payload-config';
import { authenticate, unauthorized } from '@/lib/auth';

export const GET = async (req: Request): Promise<Response> => {
  if (!authenticate(req)) {
    return unauthorized();
  }

  const payload = await getPayload({ config });
  const [services, masters] = await Promise.all([
    payload.find({ collection: 'services', depth: 0, pagination: false, sort: 'name', overrideAccess: true }),
    payload.find({ collection: 'masters', depth: 0, pagination: false, sort: 'name', overrideAccess: true }),
  ]);

  return Response.json({
    services: services.docs.map(({ id, name, durationMin }) => ({ id, name, durationMin })),
    masters: masters.docs.map(({ id, name, services: serviceIds }) => ({
      id,
      name,
      services: serviceIds.map((service) => (typeof service === 'object' ? service.id : service)),
    })),
  });
};
