import { brown, sand, tomato } from '@radix-ui/colors';

/** Colours of the procedural models (tents, totems). Snapped to the pixel palette when baked. */
export const PALETTE = {
  hide: sand.sand9,
  hideBand: brown.brown10,
  hideDark: brown.brown12,
  pole: brown.brown11,
  labBand: tomato.tomato9,
} as const;
