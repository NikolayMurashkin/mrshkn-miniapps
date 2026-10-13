import { useState } from 'react';
import type { Bridge } from '@/bridge/types';
import { OrdersTab } from './OrdersTab';
import { ScannerTab } from './ScannerTab';
import { TabPanel } from './TabPanel';
import { Tabs } from './Tabs';
import { STAFF_TABS } from './consts';
import type { StaffTab } from './types';

export type StaffAppProps = {
  bridge: Bridge;
};

export const StaffApp = ({ bridge }: StaffAppProps) => {
  const [tab, setTab] = useState<StaffTab>('scanner');

  return (
    <>
      <Tabs
        items={STAFF_TABS}
        active={tab}
        onChange={setTab}
      />
      <TabPanel
        id="scanner"
        active={tab === 'scanner'}
      >
        <ScannerTab bridge={bridge} />
      </TabPanel>
      <TabPanel
        id="orders"
        active={tab === 'orders'}
      >
        <OrdersTab
          bridge={bridge}
          active={tab === 'orders'}
        />
      </TabPanel>
    </>
  );
};
