import { getPayload } from 'payload';
import config from '@payload-config';
import { authenticate, unauthorized } from '@/lib/auth';
import { DATE_PATTERN } from '@/lib/consts';
import { loadMaster, loadService, loadSettings, masterServes, slotsForDay } from '@/lib/booking';

export const GET = async (req: Request): Promise<Response> => {
  if (!authenticate(req)) {
    return unauthorized();
  }

  const params = new URL(req.url).searchParams;
  const date = params.get('date') ?? '';

  if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    return Response.json({ error: 'invalid date' }, { status: 400 });
  }

  const payload = await getPayload({ config });
  const [service, master, settings] = await Promise.all([
    loadService(payload, params.get('serviceId')),
    loadMaster(payload, params.get('masterId')),
    loadSettings(payload),
  ]);

  if (!service || !master || !masterServes(master, service)) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }

  const slots = await slotsForDay(payload, { master, service, date, settings, now: new Date() });

  return Response.json({ slots: slots.map((slot) => slot.toISOString()) });
};
