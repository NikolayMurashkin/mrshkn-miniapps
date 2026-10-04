'use client';

import { BookingFlow } from '@/booking/BookingFlow';
import { useBridge } from '@/booking/useBridge';
import { createTelegramBridge } from '@/bridge/telegram';

const loadTelegramBridge = async () => createTelegramBridge();

const TelegramBookingPage = () => {
  const bridge = useBridge(loadTelegramBridge);

  return bridge ? <BookingFlow bridge={bridge} /> : null;
};

export default TelegramBookingPage;
