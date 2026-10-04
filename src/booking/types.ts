export type CatalogService = { id: number; name: string; durationMin: number };
export type CatalogMaster = { id: number; name: string; services: number[] };
export type Catalog = { services: CatalogService[]; masters: CatalogMaster[]; timeZone?: string };

export type Step = 'service' | 'master' | 'time' | 'review';

export type LoadStatus = 'loading' | 'ready' | 'unauthorized' | 'network' | 'failed';
export type SlotsStatus = 'loading' | 'ready' | 'network' | 'failed';
export type SubmitStatus = 'idle' | 'sending' | 'done' | 'failed' | 'network';

export type DayItem = { date: string; weekday: string; day: string };

export type Selection = { serviceId?: number; masterId?: number; startAt?: string; date?: string };

export type ApiResult<T> =
  { kind: 'ok'; data: T } | { kind: 'unauthorized' } | { kind: 'conflict' } | { kind: 'failed' };
export type NetworkFailure = { kind: 'network' };
