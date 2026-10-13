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

/** Drizzle транзакции `req`, а без нее — общий пул адаптера. */
export const drizzleOf = (payload: Payload, req?: PayloadRequest) =>
  req?.transactionID ? sessionOf(payload, req).db : (payload.db as unknown as PostgresAdapter).drizzle;

const lockKey = async (payload: Payload, req: PayloadRequest, namespace: number, key: number): Promise<void> => {
  await sessionOf(payload, req).db.execute(sql`select pg_advisory_xact_lock(${namespace}::int, ${key}::int)`);
};

/** Блокировка мастера до конца транзакции `req`: параллельные записи к одному мастеру идут по очереди. */
export const lockMaster = (payload: Payload, req: PayloadRequest, masterId: number): Promise<void> =>
  lockKey(payload, req, ADVISORY_LOCK_NAMESPACE, masterId);

/** Своя транзакция Payload с блокировкой ключа: вторая операция с тем же ключом видит уже зафиксированную первую. */
export const withLock = async <T>(
  payload: Payload,
  namespace: number,
  key: number,
  work: (req: PayloadRequest) => Promise<T>,
): Promise<T> => {
  const req = await createLocalReq({}, payload);

  await initTransaction(req);

  try {
    await lockKey(payload, req, namespace, key);

    const result = await work(req);

    await commitTransaction(req);

    return result;
  } catch (error) {
    await killTransaction(req);
    throw error;
  }
};

export const withMasterLock = <T>(
  payload: Payload,
  masterId: number,
  work: (req: PayloadRequest) => Promise<T>,
): Promise<T> => withLock(payload, ADVISORY_LOCK_NAMESPACE, masterId, work);
