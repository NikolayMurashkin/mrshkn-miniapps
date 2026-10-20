import { describe, expect, it } from 'vitest';

/**
 * Задача раз в минуту крутится по расписанию очереди. Строки INFO «Running … jobs» каждую минуту забивают лог
 * контейнера, поэтому у записи расписания INFO молчит, а ошибки заданий пишутся. Расписание и очередь прежние:
 * раз в минуту, очередь `default`. Конфиг — санированный, база не нужна.
 */

type AutoRunEntry = {
  cron?: unknown;
  queue?: unknown;
  disableScheduling?: unknown;
  silent?: unknown;
};

const loadJobs = async () => {
  const config = await (await import('@payload-config')).default;

  return config.jobs as unknown as { autoRun?: unknown; tasks?: { slug?: unknown }[] };
};

const loadAutoRun = async (): Promise<AutoRunEntry[]> => {
  const { autoRun } = await loadJobs();

  if (!Array.isArray(autoRun)) {
    throw new Error(`config.jobs.autoRun должен быть массивом записей, а он ${typeof autoRun}`);
  }

  return autoRun as AutoRunEntry[];
};

describe('расписание задачи раз в минуту', () => {
  it('J1: одна запись autoRun — очередь default, cron раз в минуту, расписание включено', async () => {
    const autoRun = await loadAutoRun();

    expect(autoRun, 'записей в config.jobs.autoRun').toHaveLength(1);

    const [entry] = autoRun;

    expect(entry.queue, 'очередь записи').toBe('default');
    expect(entry.cron, 'cron записи').toBe('* * * * *');
    expect(entry.disableScheduling, 'disableScheduling').not.toBe(true);
  });

  it('J2: silent записи — { info: true }: INFO «Running … jobs» не пишется, ошибки пишутся', async () => {
    const [entry] = await loadAutoRun();

    expect(entry.silent, 'silent записи autoRun').toEqual({ info: true });
  });

  it('J3: в задачах есть tick — запись крутит именно ее', async () => {
    const { tasks } = await loadJobs();

    expect(
      (tasks ?? []).map(({ slug }) => slug),
      'slug задач config.jobs.tasks',
    ).toContain('tick');
  });
});
