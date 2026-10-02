import { getPayload } from 'payload';
import config from '@payload-config';
import { authenticate, unauthorized } from '@/lib/auth';
import { cancelBooking } from '@/lib/booking';

type CancelRouteContext = { params: Promise<{ id: string }> };

export const POST = async (req: Request, { params }: CancelRouteContext): Promise<Response> => {
  const auth = authenticate(req);

  if (!auth) {
    return unauthorized();
  }

  const { id } = await params;
  const payload = await getPayload({ config });
  const outcome = await cancelBooking(payload, { auth, bookingId: id, now: new Date() });

  return outcome.status === 200
    ? Response.json({ ok: true })
    : Response.json({ error: 'rejected' }, { status: outcome.status });
};
