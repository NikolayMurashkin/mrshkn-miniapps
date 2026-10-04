import { BLUE_WEIGHT, GREEN_WEIGHT, HEX_COLOR, RED_WEIGHT } from './consts';

export const isHexColor = (value: string): boolean => HEX_COLOR.test(value);

/** Яркость цвета `#rrggbb` от 0 до 255. */
export const brightness = (hex: string): number => {
  const value = Number.parseInt(hex.slice(1), 16);

  return RED_WEIGHT * (value >> 16) + GREEN_WEIGHT * ((value >> 8) & 255) + BLUE_WEIGHT * (value & 255);
};
