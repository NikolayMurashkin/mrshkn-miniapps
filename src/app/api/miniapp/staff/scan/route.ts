import { getPayload } from 'payload';
import config from '@payload-config';
import { authenticate, unauthorized } from '@/lib/auth';
import { readJson, sendResult } from '@/lib/http';
import { scanGuestQr } from '@/lib/loyalty-service';

export const POST = async (req: Request): Promise<Response> => {
  const auth = authenticate(req);

  if (!auth) {
    return unauthorized();
  }

  const body = (await readJson(req)) as { qrToken?: unknown } | null;
  const payload = await getPayload({ config });

  return sendResult(await scanGuestQr(payload, auth, body?.qrToken, new Date()));
};
