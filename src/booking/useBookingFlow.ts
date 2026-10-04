import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bridge } from '@/bridge/types';
import { createBooking, fetchCatalog, fetchSlots } from './api';
import { DEFAULT_TIME_ZONE, MAIN_BUTTON_TEXT, PREVIOUS_STEP } from './consts';
import { buildDays, todayIn } from './format';
import type { Catalog, DayItem, LoadStatus, Selection, SlotsStatus, Step, SubmitStatus } from './types';

export const useBookingFlow = (bridge: Bridge) => {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState<Step>('service');
  const [selection, setSelection] = useState<Selection>({});
  const [days, setDays] = useState<DayItem[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsStatus, setSlotsStatus] = useState<SlotsStatus>('loading');
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle');
  const [conflict, setConflict] = useState(false);

  // ref нужен, чтобы два нажатия подряд в одном тике увидели один и тот же «в полете»
  const selectionRef = useRef<Selection>({});
  const stepRef = useRef<Step>('service');
  const inFlightRef = useRef(false);
  const slotsRequestRef = useRef(0);

  const timeZone = catalog?.timeZone || DEFAULT_TIME_ZONE;

  useEffect(() => {
    let cancelled = false;

    fetchCatalog(bridge).then((result) => {
      if (cancelled) {
        return;
      }

      if (result.kind === 'ok') {
        setCatalog(result.data);
        setLoadStatus('ready');
      } else {
        setLoadStatus(result.kind === 'unauthorized' || result.kind === 'network' ? result.kind : 'failed');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [bridge, attempt]);

  const retryCatalog = () => {
    setLoadStatus('loading');
    setAttempt((value) => value + 1);
  };

  const goTo = useCallback((next: Step) => {
    stepRef.current = next;
    setStep(next);
  }, []);

  const loadSlots = useCallback(
    async (date: string) => {
      const { serviceId, masterId } = selectionRef.current;

      if (serviceId === undefined || masterId === undefined) {
        return;
      }

      const requestId = slotsRequestRef.current + 1;

      slotsRequestRef.current = requestId;
      selectionRef.current = { ...selectionRef.current, date };
      setSelection(selectionRef.current);
      setSlotsStatus('loading');

      const result = await fetchSlots(bridge, { serviceId, masterId, date });

      if (requestId !== slotsRequestRef.current) {
        return;
      }

      if (result.kind === 'ok') {
        setSlots([...result.data.slots].sort((first, second) => Date.parse(first) - Date.parse(second)));
        setSlotsStatus('ready');
      } else if (result.kind === 'unauthorized') {
        setLoadStatus('unauthorized');
      } else {
        setSlotsStatus(result.kind === 'network' ? 'network' : 'failed');
      }
    },
    [bridge],
  );

  const chooseService = (serviceId: number) => {
    selectionRef.current = { serviceId };
    setSelection(selectionRef.current);
    goTo('master');
  };

  const chooseMaster = (masterId: number) => {
    const list = buildDays(todayIn(timeZone));

    selectionRef.current = { ...selectionRef.current, masterId, startAt: undefined };
    setSelection(selectionRef.current);
    setDays(list);
    setConflict(false);
    setSlots([]);
    goTo('time');
    void loadSlots(list[0].date);
  };

  const chooseDate = (date: string) => {
    setConflict(false);
    void loadSlots(date);
  };

  const chooseSlot = (startAt: string) => {
    selectionRef.current = { ...selectionRef.current, startAt };
    setSelection(selectionRef.current);
    setConflict(false);
    setSubmitStatus('idle');
    goTo('review');
  };

  const goBack = () => {
    const previous = PREVIOUS_STEP[stepRef.current];

    if (previous && !inFlightRef.current) {
      goTo(previous);
    }
  };

  const submit = useCallback(async () => {
    const { serviceId, masterId, startAt, date } = selectionRef.current;

    if (inFlightRef.current || stepRef.current !== 'review') {
      return;
    }

    if (serviceId === undefined || masterId === undefined || !startAt) {
      return;
    }

    inFlightRef.current = true;
    bridge.mainButton.disable();
    setSubmitStatus('sending');

    const result = await createBooking(bridge, { serviceId, masterId, startAt });

    if (result.kind === 'ok') {
      setSubmitStatus('done');

      return;
    }

    inFlightRef.current = false;
    bridge.mainButton.enable();

    if (result.kind === 'unauthorized') {
      setLoadStatus('unauthorized');
    } else if (result.kind === 'conflict') {
      setSubmitStatus('idle');
      setConflict(true);
      goTo('time');

      if (date) {
        void loadSlots(date);
      }
    } else {
      setSubmitStatus(result.kind === 'network' ? 'network' : 'failed');
    }
  }, [bridge, goTo, loadSlots]);

  useEffect(() => bridge.mainButton.onClick(() => void submit()), [bridge, submit]);

  const reviewing = loadStatus === 'ready' && step === 'review' && submitStatus !== 'done';

  useEffect(() => {
    if (reviewing) {
      bridge.mainButton.setText(MAIN_BUTTON_TEXT);
      bridge.mainButton.show();
      bridge.mainButton.enable();
    } else {
      bridge.mainButton.hide();
    }
  }, [bridge, reviewing]);

  useEffect(() => () => bridge.mainButton.hide(), [bridge]);

  return {
    catalog,
    loadStatus,
    step,
    selection,
    days,
    slots,
    slotsStatus,
    submitStatus,
    conflict,
    timeZone,
    retryCatalog,
    retrySlots: () => selection.date && void loadSlots(selection.date),
    retrySubmit: () => void submit(),
    chooseService,
    chooseMaster,
    chooseDate,
    chooseSlot,
    goBack,
  };
};
