import { getPayload } from 'payload';
import config from '@payload-config';
import { authenticate, unauthorized } from '@/lib/auth';
import { createBooking } from '@/lib/booking';

const readBody = async (req: Request): Promise<Record<string, unknown>> => {
  try {
    const body: unknown = await req.json();

    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

export const POST = async (req: Request): Promise<Response> => {
  const auth = authenticate(req);

  if (!auth) {
    return unauthorized();
  }

  const body = await readBody(req);
  const payload = await getPayload({ config });
  const outcome = await createBooking(payload, {
    auth,
    serviceId: body.serviceId,
    masterId: body.masterId,
    startAt: body.startAt,
    now: new Date(),
  });

  return outcome.status === 201
    ? Response.json({ id: outcome.id }, { status: 201 })
    : Response.json({ error: 'rejected' }, { status: outcome.status });
};
