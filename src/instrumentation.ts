export const register = async (): Promise<void> => {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') {
    return;
  }

  const { getPayload } = await import('payload');
  const { default: config } = await import('@payload-config');

  await getPayload({ config, cron: true });
};
