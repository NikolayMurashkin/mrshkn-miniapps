import { getPayload } from 'payload';
import config from '@payload-config';
import { authenticate, unauthorized } from '@/lib/auth';
import { sendResult } from '@/lib/http';
import { staffOrders } from '@/lib/orders';

export const GET = async (req: Request): Promise<Response> => {
  const auth = authenticate(req);

  if (!auth) {
    return unauthorized();
  }

  const payload = await getPayload({ config });

  return sendResult(await staffOrders(payload, auth));
};
