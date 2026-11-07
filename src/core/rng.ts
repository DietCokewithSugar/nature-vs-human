/**
 * Seeded randomness for the logic core (mulberry32). The state is a uint32 kept in the run,
 * so a saved run replays the same disasters and tests can pin a seed.
 */
export function nextRandom(holder: { rng: number }): number {
  let t = (holder.rng = (holder.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
