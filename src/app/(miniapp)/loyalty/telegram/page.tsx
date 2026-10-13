'use client';

import { useBridge } from '@/booking/useBridge';
import { createTelegramBridge } from '@/bridge/telegram';
import { LoyaltyApp } from '@/loyalty/LoyaltyApp';

const loadTelegramBridge = async () => createTelegramBridge();

const TelegramLoyaltyPage = () => {
  const bridge = useBridge(loadTelegramBridge);

  return bridge ? <LoyaltyApp bridge={bridge} /> : null;
};

export default TelegramLoyaltyPage;
