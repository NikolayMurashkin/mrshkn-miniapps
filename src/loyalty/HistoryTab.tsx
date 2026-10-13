import { useCallback, useEffect, useState } from 'react';
import type { Bridge } from '@/bridge/types';
import { fetchHistory } from './api';
import styles from './Loyalty.module.scss';
import { StatusMessage } from './StatusMessage';
import { EVENT_LABELS, TEXTS } from './consts';
import { formatMoment } from './format';
import type { ApiResult, HistoryEvent, LoadStatus } from './types';

export type HistoryTabProps = {
  bridge: Bridge;
  active: boolean;
};

export const HistoryTab = ({ bridge, active }: HistoryTabProps) => {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');

  const apply = useCallback((result: ApiResult<{ events: HistoryEvent[] }>) => {
    if (result.kind === 'ok') {
      setEvents(result.data.events);
      setStatus('ready');
    } else {
      setStatus(result.kind === 'unauthorized' || result.kind === 'network' ? result.kind : 'failed');
    }
  }, []);

  const load = () => fetchHistory(bridge).then(apply);

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;

    fetchHistory(bridge).then((result) => !cancelled && apply(result));

    return () => {
      cancelled = true;
    };
  }, [active, bridge, apply]);

  const renderBody = () => {
    if (status === 'loading') {
      return <StatusMessage text={TEXTS.loading} />;
    }

    if (status === 'unauthorized') {
      return <StatusMessage text={TEXTS.unauthorized} />;
    }

    if (status !== 'ready') {
      return (
        <StatusMessage
          text={status === 'network' ? TEXTS.network : TEXTS.loadFailed}
          onRetry={() => void load()}
        />
      );
    }

    if (events.length === 0) {
      return <StatusMessage text={TEXTS.historyEmpty} />;
    }

    return (
      <ul className={styles.history}>
        {events.map((event, index) => (
          <li
            key={`${event.at}-${index}`}
            data-type={event.type}
          >
            <span className={styles.name}>{EVENT_LABELS[event.type]}</span>
            <time
              className={styles.hint}
              dateTime={event.at}
            >
              {formatMoment(event.at)}
            </time>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <>
      <h1 className={styles.title}>{TEXTS.historyTitle}</h1>
      {renderBody()}
    </>
  );
};
