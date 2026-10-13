import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Лояльность' };

type LoyaltyLayoutProps = { children: ReactNode };

const LoyaltyLayout = ({ children }: LoyaltyLayoutProps) => children;

export default LoyaltyLayout;
