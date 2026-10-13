import type { ServiceResult } from './types';

/** Тело запроса как JSON; null — тела нет или это не JSON. */
export const readJson = async (req: Request): Promise<unknown> => {
  try {
    return (await req.json()) as unknown;
  } catch {
    return null;
  }
};

export const sendResult = <T>(result: ServiceResult<T>): Response =>
  result.status === 200 || result.status === 201
    ? Response.json(result.body, { status: result.status })
    : Response.json({ error: 'rejected' }, { status: result.status });
