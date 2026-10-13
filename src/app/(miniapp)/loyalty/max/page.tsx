'use client';

import { useBridge } from '@/booking/useBridge';
import { loadMaxBridge } from '@/bridge/max';
import { LoyaltyApp } from '@/loyalty/LoyaltyApp';

const MaxLoyaltyPage = () => {
  const bridge = useBridge(loadMaxBridge);

  return bridge ? <LoyaltyApp bridge={bridge} /> : null;
};

export default MaxLoyaltyPage;
