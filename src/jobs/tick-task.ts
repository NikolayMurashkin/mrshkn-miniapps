import type { TaskConfig } from 'payload';
import { TICK_CRON, TICK_QUEUE, TICK_TASK_SLUG } from '../lib/consts';
import { runTick } from './tick';

export const tickTask: TaskConfig<{ input: Record<string, never>; output: Record<string, never> }> = {
  slug: TICK_TASK_SLUG,
  schedule: [{ cron: TICK_CRON, queue: TICK_QUEUE }],
  handler: async ({ req }) => {
    await runTick(req.payload, new Date());

    return { output: {} };
  },
};
