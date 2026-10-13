import { getPayload } from 'payload';
import config from '@payload-config';
import { authenticate, unauthorized } from '@/lib/auth';
import { sendResult } from '@/lib/http';
import { redeemCoupon } from '@/lib/loyalty-service';

type RedeemRouteContext = { params: Promise<{ id: string }> };

export const POST = async (req: Request, { params }: RedeemRouteContext): Promise<Response> => {
  const auth = authenticate(req);

  if (!auth) {
    return unauthorized();
  }

  const { id } = await params;
  const payload = await getPayload({ config });

  return sendResult(await redeemCoupon(payload, auth, id, new Date()));
};
