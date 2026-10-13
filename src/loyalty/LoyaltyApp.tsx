'use client';

import type { CSSProperties } from 'react';
import type { Bridge } from '@/bridge/types';
import { GuestApp } from './GuestApp';
import styles from './Loyalty.module.scss';
import { StaffApp } from './StaffApp';
import { StatusMessage } from './StatusMessage';
import { TEXTS } from './consts';
import { useLoyaltyMe } from './useLoyaltyMe';

export type LoyaltyAppProps = {
  bridge: Bridge;
};

const themeVariables = ({ colors }: Bridge['theme']): CSSProperties =>
  ({
    '--bg': colors.bg,
    '--text': colors.text,
    '--hint': colors.hint,
    '--link': colors.link,
    '--button': colors.button,
    '--button-text': colors.buttonText,
    '--secondary-bg': colors.secondaryBg,
  }) as CSSProperties;

/** Роль из первого запроса: кассир видит сканер и заказы, гость — карту, меню, историю и приглашение. */
export const LoyaltyApp = ({ bridge }: LoyaltyAppProps) => {
  const { me, status, setMe, retry } = useLoyaltyMe(bridge);

  const renderBody = () => {
    if (status === 'loading') {
      return <StatusMessage text={TEXTS.loading} />;
    }

    if (status === 'unauthorized') {
      return <StatusMessage text={TEXTS.unauthorized} />;
    }

    if (status !== 'ready' || !me) {
      return (
        <StatusMessage
          text={status === 'network' ? TEXTS.network : TEXTS.loadFailed}
          onRetry={retry}
        />
      );
    }

    return (
      <>
        {me.role === 'staff' ? (
          <StaffApp bridge={bridge} />
        ) : (
          <GuestApp
            bridge={bridge}
            me={me}
            onMe={setMe}
          />
        )}
        {me.demo === true && <p className={styles.demoNote}>{TEXTS.demoNote}</p>}
      </>
    );
  };

  return (
    <main
      className={styles.root}
      data-scheme={bridge.theme.scheme}
      style={themeVariables(bridge.theme)}
    >
      {renderBody()}
    </main>
  );
};
