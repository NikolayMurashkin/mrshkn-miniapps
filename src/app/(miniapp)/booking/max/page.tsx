'use client';

import { BookingFlow } from '@/booking/BookingFlow';
import { useBridge } from '@/booking/useBridge';
import { loadMaxBridge } from '@/bridge/max';

const MaxBookingPage = () => {
  const bridge = useBridge(loadMaxBridge);

  return bridge ? <BookingFlow bridge={bridge} /> : null;
};

export default MaxBookingPage;
