import { getPayload } from 'payload';
import config from '@payload-config';
import { authenticate, unauthorized } from '@/lib/auth';
import { readJson, sendResult } from '@/lib/http';
import { setOrderStatus } from '@/lib/orders';

type StatusRouteContext = { params: Promise<{ id: string }> };

export const POST = async (req: Request, { params }: StatusRouteContext): Promise<Response> => {
  const auth = authenticate(req);

  if (!auth) {
    return unauthorized();
  }

  const [{ id }, body] = await Promise.all([params, readJson(req)]);
  const payload = await getPayload({ config });

  return sendResult(await setOrderStatus(payload, auth, id, (body as { status?: unknown } | null)?.status));
};
