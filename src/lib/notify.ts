import type { Payload } from 'payload';

/** Сбой побочного действия в лог: исключение - error, `false` от бота - warn. labels - кому адресовано действие. */
export const logSideEffects = (payload: Payload, results: PromiseSettledResult<unknown>[], labels: string[]): void => {
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      payload.logger.error({ err: result.reason, msg: `сбой побочного действия записи: ${labels[index]}` });
    } else if (result.value === false) {
      payload.logger.warn({ msg: `уведомление не доставлено: ${labels[index]}` });
    }
  });
};
