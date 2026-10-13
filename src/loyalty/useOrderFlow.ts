import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bridge } from '@/bridge/types';
import { createOrder, fetchMenu, fetchMyOrders } from './api';
import { addToCart, cartToOrderLines, pruneCart, removeFromCart } from './cart';
import { ORDER_BUTTON_TEXT } from './consts';
import type { ApiResult, Cart, GuestOrder, LoadStatus, MenuItem, Pickup, SubmitStatus } from './types';

/** Меню, корзина и предзаказ; главная кнопка платформы оформляет заказ, пока открыта вкладка меню. */
export const useOrderFlow = (bridge: Bridge, active: boolean) => {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<GuestOrder[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  const [cart, setCart] = useState<Cart>({});
  const [pickup, setPickup] = useState<Pickup>('asap');
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle');
  const [placedId, setPlacedId] = useState<number | null>(null);

  // ref нужен, чтобы нажатие главной кнопки видело текущую корзину и два нажатия подряд — один заказ в полете
  const stateRef = useRef({ cart, pickup, active });
  const inFlightRef = useRef(false);

  useEffect(() => {
    stateRef.current = { cart, pickup, active };
  }, [cart, pickup, active]);

  const applyOrders = useCallback((result: ApiResult<{ orders: GuestOrder[] }>) => {
    if (result.kind === 'ok') {
      setOrders(result.data.orders);
    }
  }, []);

  const loadOrders = useCallback(() => fetchMyOrders(bridge).then(applyOrders), [bridge, applyOrders]);

  useEffect(() => {
    let cancelled = false;

    fetchMenu(bridge).then((result) => {
      if (cancelled) {
        return;
      }

      if (result.kind === 'ok') {
        setItems(result.data.items);
        setStatus('ready');
      } else {
        setStatus(result.kind === 'unauthorized' || result.kind === 'network' ? result.kind : 'failed');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [bridge, attempt]);

  useEffect(() => {
    if (active) {
      fetchMyOrders(bridge).then(applyOrders);
    }
  }, [active, bridge, applyOrders]);

  const reloadMenu = useCallback(async () => {
    const result = await fetchMenu(bridge);

    if (result.kind === 'ok') {
      setItems(result.data.items);
      setCart((current) => pruneCart(current, result.data.items));
    }
  }, [bridge]);

  const submit = useCallback(async () => {
    const lines = cartToOrderLines(stateRef.current.cart);

    if (inFlightRef.current || !stateRef.current.active || lines.length === 0) {
      return;
    }

    inFlightRef.current = true;
    setSubmitStatus('sending');

    const result = await createOrder(bridge, { items: lines, pickup: stateRef.current.pickup });

    inFlightRef.current = false;

    if (result.kind === 'ok') {
      setPlacedId(result.data.id);
      setCart({});
      setSubmitStatus('done');
      void loadOrders();
    } else if (result.kind === 'conflict') {
      setSubmitStatus('conflict');
      void reloadMenu();
    } else if (result.kind === 'unauthorized') {
      setStatus('unauthorized');
    } else {
      setSubmitStatus(result.kind === 'network' ? 'network' : 'failed');
    }
  }, [bridge, loadOrders, reloadMenu]);

  useEffect(() => bridge.mainButton.onClick(() => void submit()), [bridge, submit]);

  const hasLines = cartToOrderLines(cart).length > 0;
  const showButton = active && status === 'ready' && hasLines && submitStatus !== 'done';
  const sending = submitStatus === 'sending';

  useEffect(() => {
    if (!showButton) {
      bridge.mainButton.hide();

      return;
    }

    bridge.mainButton.setText(ORDER_BUTTON_TEXT);
    bridge.mainButton.show();

    if (sending) {
      bridge.mainButton.disable();
    } else {
      bridge.mainButton.enable();
    }
  }, [bridge, showButton, sending]);

  useEffect(() => () => bridge.mainButton.hide(), [bridge]);

  const resetSubmit = () => {
    if (submitStatus !== 'sending') {
      setSubmitStatus('idle');
    }
  };

  return {
    items,
    orders,
    status,
    cart,
    pickup,
    submitStatus,
    placedId,
    add: (id: string) => {
      resetSubmit();
      setCart((current) => addToCart(current, id));
    },
    remove: (id: string) => {
      resetSubmit();
      setCart((current) => removeFromCart(current, id));
    },
    choosePickup: setPickup,
    retry: () => {
      setStatus('loading');
      setAttempt((value) => value + 1);
    },
    retrySubmit: () => void submit(),
    backToMenu: () => {
      setPlacedId(null);
      setSubmitStatus('idle');
    },
  };
};
