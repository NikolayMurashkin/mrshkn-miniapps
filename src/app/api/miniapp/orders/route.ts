import { getPayload } from 'payload';
import config from '@payload-config';
import { authenticate, unauthorized } from '@/lib/auth';
import { readJson, sendResult } from '@/lib/http';
import { createOrder, guestOrders } from '@/lib/orders';

export const GET = async (req: Request): Promise<Response> => {
  const auth = authenticate(req);

  if (!auth) {
    return unauthorized();
  }

  const payload = await getPayload({ config });

  return Response.json(await guestOrders(payload, auth));
};

export const POST = async (req: Request): Promise<Response> => {
  const auth = authenticate(req);

  if (!auth) {
    return unauthorized();
  }

  const body = await readJson(req);
  const payload = await getPayload({ config });

  return sendResult(await createOrder(payload, auth, body, new Date()));
};
