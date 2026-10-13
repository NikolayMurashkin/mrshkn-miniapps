import { getPayload } from 'payload';
import config from '@payload-config';
import { authenticate, unauthorized } from '@/lib/auth';
import { loyaltyHistory } from '@/lib/loyalty-service';

export const GET = async (req: Request): Promise<Response> => {
  const auth = authenticate(req);

  if (!auth) {
    return unauthorized();
  }

  const payload = await getPayload({ config });

  return Response.json(await loyaltyHistory(payload, auth));
};
