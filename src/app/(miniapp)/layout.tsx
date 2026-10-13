import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { DARK_COLORS, DARK_SCHEME_QUERY, LIGHT_COLORS, LIGHT_SCHEME_QUERY } from '@/bridge/consts';
import './globals.scss';

export const metadata: Metadata = { title: 'Запись' };

/** Браузер и клиент мессенджера красят фон и полосы до загрузки темы платформы — цветами тех же тем bridge. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: LIGHT_SCHEME_QUERY, color: LIGHT_COLORS.bg },
    { media: DARK_SCHEME_QUERY, color: DARK_COLORS.bg },
  ],
};

type MiniAppLayoutProps = { children: ReactNode };

const MiniAppLayout = ({ children }: MiniAppLayoutProps) => (
  <html lang="ru">
    <body>{children}</body>
  </html>
);

export default MiniAppLayout;
