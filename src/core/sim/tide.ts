import { BALANCE } from '../config/balance.ts';
import type { Mods } from '../modifiers.ts';
import type { TideState } from '../state.ts';

const TAU = Math.PI * 2;

/** Tide height in [0, 1]. Starts at low tide. */
export function tideLevel(clock: number, period: number = BALANCE.tide.period): number {
  return (1 - Math.cos((TAU * clock) / period)) / 2;
}

export function tideRising(clock: number): boolean {
  return Math.sin((TAU * clock) / BALANCE.tide.period) > 0;
}

/** Instantaneous marine multiplier. 1 when the tide mechanic is locked. */
export function tideMult(tide: TideState, mods: Mods): number {
  if (!mods.tide) return 1;
  if (tide.surgeLeft > 0) return (1 + mods.tideAmp) * BALANCE.tide.surgeMult;
  return 1 + mods.tideAmp * tideLevel(tide.clock);
}

/** Exact integral of the marine multiplier over [clock, clock + h]. Steps must not cross a surge's end. */
export function tideIntegral(tide: TideState, mods: Mods, h: number): number {
  if (!mods.tide) return h;
  if (tide.surgeLeft > 0) return h * (1 + mods.tideAmp) * BALANCE.tide.surgeMult;
  const T = BALANCE.tide.period;
  const a = tide.clock;
  const b = a + h;
  const levelIntegral = h / 2 - (T / (2 * TAU)) * (Math.sin((TAU * b) / T) - Math.sin((TAU * a) / T));
  return h + mods.tideAmp * levelIntegral;
}

export function advanceTide(tide: TideState, h: number): void {
  tide.clock = (tide.clock + h) % (BALANCE.tide.period * 1000);
  tide.surgeLeft = Math.max(0, tide.surgeLeft - h);
}
