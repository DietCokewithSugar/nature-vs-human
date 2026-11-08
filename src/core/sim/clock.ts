import { BALANCE, HOUR } from '../config/balance.ts';

/** Hours since midnight of day 0 (the run starts at BALANCE.startHour). */
export function absHour(time: number): number {
  return time / HOUR + BALANCE.startHour;
}

/** Hour of the day, 0 … 24. */
export function hourOf(time: number): number {
  return absHour(time) % 24;
}

/** Day number, counted from the first midnight before the run started. */
export function dayOf(time: number): number {
  return Math.floor(absHour(time) / 24);
}

/** A day count for a habit centred on `at` o'clock, so a habit that straddles midnight counts once. */
export function habitDay(time: number, at: number): number {
  return Math.floor((absHour(time) - at + 24) / 24);
}

/** Hours since the habit's hour came round today (0 … 24). */
export function sinceHabit(time: number, at: number): number {
  return (((absHour(time) - at) % 24) + 24) % 24;
}

/** Is an hour inside a window centred on `at`, `hours` long? */
export function inWindow(hour: number, at: number, hours: number): boolean {
  const d = Math.abs((((hour - at) % 24) + 36) % 24 - 12);
  return 12 - d <= hours / 2;
}

/** 0 at midnight, 1 at noon: how bright it is. */
export function daylight(time: number): number {
  const h = hourOf(time);
  return Math.max(0, Math.min(1, (Math.cos(((h - 12) / 24) * Math.PI * 2) + 0.25) / 1.1));
}

export function isNight(time: number): boolean {
  const h = hourOf(time);
  return h < 5.5 || h >= 19;
}
