import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.scss';

export const metadata: Metadata = { title: 'Запись' };

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

type MiniAppLayoutProps = { children: ReactNode };

const MiniAppLayout = ({ children }: MiniAppLayoutProps) => (
  <html lang="ru">
    <body>{children}</body>
  </html>
);

export default MiniAppLayout;
