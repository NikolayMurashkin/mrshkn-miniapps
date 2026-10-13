import { getPayload } from 'payload';
import config from '@payload-config';
import { authenticate, unauthorized } from '@/lib/auth';
import { menuItems } from '@/lib/orders';

export const GET = async (req: Request): Promise<Response> => {
  if (!authenticate(req)) {
    return unauthorized();
  }

  const payload = await getPayload({ config });

  return Response.json(await menuItems(payload));
};
