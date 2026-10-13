import type { KeyboardEvent } from 'react';
import styles from './Loyalty.module.scss';
import { KEY_STEPS } from './consts';
import type { TabItem } from './types';

export type TabsProps<T extends string> = {
  items: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
};

export const tabId = (id: string): string => `tab-${id}`;
export const panelId = (id: string): string => `panel-${id}`;

export const Tabs = <T extends string>({ items, active, onChange }: TabsProps<T>) => {
  const focusTab = (index: number) => {
    const next = items[(index + items.length) % items.length];

    onChange(next.id);
    document.getElementById(tabId(next.id))?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex(({ id }) => id === active);

    if (event.key in KEY_STEPS) {
      event.preventDefault();
      focusTab(index + KEY_STEPS[event.key]);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusTab(event.key === 'Home' ? 0 : items.length - 1);
    }
  };

  return (
    <div
      className={styles.tabs}
      role="tablist"
      onKeyDown={onKeyDown}
    >
      {items.map(({ id, label }) => (
        <button
          key={id}
          id={tabId(id)}
          type="button"
          role="tab"
          className={styles.tab}
          aria-selected={id === active}
          aria-controls={panelId(id)}
          tabIndex={id === active ? 0 : -1}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
};
