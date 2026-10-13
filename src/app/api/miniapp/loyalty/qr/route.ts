import { getPayload } from 'payload';
import config from '@payload-config';
import { authenticate, unauthorized } from '@/lib/auth';
import { issueQr } from '@/lib/loyalty-service';

export const POST = async (req: Request): Promise<Response> => {
  const auth = authenticate(req);

  if (!auth) {
    return unauthorized();
  }

  const payload = await getPayload({ config });

  return Response.json(await issueQr(payload, auth, new Date()), { status: 201 });
};
