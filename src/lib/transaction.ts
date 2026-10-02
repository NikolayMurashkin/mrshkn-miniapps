import { sql, type PostgresAdapter } from '@payloadcms/db-postgres';
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from 'payload';
import type { Payload, PayloadRequest } from 'payload';
import { ADVISORY_LOCK_NAMESPACE } from './consts';

const sessionOf = (payload: Payload, req: PayloadRequest) => {
  const session = (payload.db as unknown as PostgresAdapter).sessions[String(req.transactionID)];

  if (!session) {
    throw new Error('транзакция не найдена в сессиях адаптера');
  }

  return session;
};

/** Блокировка мастера до конца транзакции `req`: параллельные записи к одному мастеру идут по очереди. */
export const lockMaster = async (payload: Payload, req: PayloadRequest, masterId: number): Promise<void> => {
  await sessionOf(payload, req).db.execute(
    sql`select pg_advisory_xact_lock(${ADVISORY_LOCK_NAMESPACE}::int, ${masterId}::int)`,
  );
};

/** Своя транзакция Payload с блокировкой мастера: вторая запись видит уже зафиксированную первую. */
export const withMasterLock = async <T>(
  payload: Payload,
  masterId: number,
  work: (req: PayloadRequest) => Promise<T>,
): Promise<T> => {
  const req = await createLocalReq({}, payload);

  await initTransaction(req);

  try {
    await lockMaster(payload, req, masterId);

    const result = await work(req);

    await commitTransaction(req);

    return result;
  } catch (error) {
    await killTransaction(req);
    throw error;
  }
};
