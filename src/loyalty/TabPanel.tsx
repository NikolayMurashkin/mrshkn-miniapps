import type { ReactNode } from 'react';
import { panelId, tabId } from './Tabs';

export type TabPanelProps = {
  id: string;
  active: boolean;
  children: ReactNode;
};

/** Панели не размонтируются при переключении: корзина и результат скана переживают смену вкладки. */
export const TabPanel = ({ id, active, children }: TabPanelProps) => (
  <section
    id={panelId(id)}
    role="tabpanel"
    aria-labelledby={tabId(id)}
    hidden={!active}
  >
    {children}
  </section>
);
