import { useState } from 'react';
import type { Bridge } from '@/bridge/types';
import { CardTab } from './CardTab';
import { HistoryTab } from './HistoryTab';
import { InviteTab } from './InviteTab';
import { MenuTab } from './MenuTab';
import { TabPanel } from './TabPanel';
import { Tabs } from './Tabs';
import { GUEST_TABS } from './consts';
import type { GuestMe, GuestTab, Me } from './types';

export type GuestAppProps = {
  bridge: Bridge;
  me: GuestMe;
  onMe: (me: Me) => void;
};

export const GuestApp = ({ bridge, me, onMe }: GuestAppProps) => {
  const [tab, setTab] = useState<GuestTab>('card');
  // без имени бота ссылки нет — и вкладки «Пригласить» тоже
  const tabs = me.referralLink ? GUEST_TABS : GUEST_TABS.filter(({ id }) => id !== 'invite');

  return (
    <>
      <Tabs
        items={tabs}
        active={tab}
        onChange={setTab}
      />
      <TabPanel
        id="card"
        active={tab === 'card'}
      >
        <CardTab
          bridge={bridge}
          me={me}
          active={tab === 'card'}
          onMe={onMe}
        />
      </TabPanel>
      <TabPanel
        id="menu"
        active={tab === 'menu'}
      >
        <MenuTab
          bridge={bridge}
          active={tab === 'menu'}
        />
      </TabPanel>
      <TabPanel
        id="history"
        active={tab === 'history'}
      >
        <HistoryTab
          bridge={bridge}
          active={tab === 'history'}
        />
      </TabPanel>
      {me.referralLink && (
        <TabPanel
          id="invite"
          active={tab === 'invite'}
        >
          <InviteTab link={me.referralLink} />
        </TabPanel>
      )}
    </>
  );
};
