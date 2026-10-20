import { PHASE_PRODUCTION_BUILD } from 'next/constants';

/**
 * Payload поднимается при старте процесса, до первого запроса — только в рантайме Node.js и не на сборке. Код подъема
 * в отдельном модуле и импортируется внутри проверки рантайма: так он не попадает в сборку для Edge.
 */
export const register = async (): Promise<void> => {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
    const { startPayload } = await import('./instrumentation-node');

    await startPayload();
  }
};
