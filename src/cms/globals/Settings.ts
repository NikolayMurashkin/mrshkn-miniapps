import type { GlobalConfig, NumberFieldSingleValidation, TextFieldSingleValidation } from 'payload';
import { DEFAULT_SLOT_STEP_MIN, DEFAULT_TIME_ZONE, SLOT_STEPS_MIN } from '../../lib/consts';
import { isLoggedIn } from '../access';

const isKnownTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat('ru-RU', { timeZone: value });

    return true;
  } catch {
    return false;
  }
};

const validateTimeZone: TextFieldSingleValidation = (value) =>
  typeof value === 'string' && isKnownTimeZone(value) ? true : 'Неизвестный часовой пояс';

const validateSlotStep: NumberFieldSingleValidation = (value) =>
  typeof value === 'number' && SLOT_STEPS_MIN.includes(value) ? true : 'Допустимо 15, 30 или 60';

export const Settings: GlobalConfig = {
  slug: 'settings',
  label: 'Настройки записи',
  access: { read: isLoggedIn, update: isLoggedIn },
  fields: [
    {
      name: 'timeZone',
      type: 'text',
      label: 'Часовой пояс бизнеса',
      required: true,
      defaultValue: DEFAULT_TIME_ZONE,
      admin: { description: 'Название по IANA, например Europe/Kaliningrad.' },
      validate: validateTimeZone,
    },
    {
      name: 'slotStepMin',
      type: 'number',
      label: 'Шаг сетки слотов, мин',
      required: true,
      defaultValue: DEFAULT_SLOT_STEP_MIN,
      admin: { description: 'Допустимо 15, 30 или 60.' },
      validate: validateSlotStep,
    },
  ],
};
