import { GENE_UPGRADES } from './config/genes.ts';
import { UPGRADES } from './config/upgrades.ts';
import { CREATURES } from './config/creatures.ts';
import type { GameState } from './state.ts';
import type { CreatureId, GeneUpgradeDef, Requirement, UpgradeDef } from './types.ts';

export function meets(state: GameState, r: Requirement): boolean {
  switch (r.type) {
    case 'owned':
      return state.creatures[r.creature].bought >= r.n;
    case 'era':
      return state.era >= r.era;
    case 'upgrade':
      return state.upgrades[r.id] === true;
    case 'runEarned':
      return state.runEarned.gt(0) && state.runEarned.log10() >= r.log10;
    case 'notEnded':
      return state.endedAt === null;
  }
}

/** Upgrades whose requirements are met and that are not yet owned. */
export function availableUpgrades(state: GameState): UpgradeDef[] {
  return UPGRADES.filter(
    (u) => !state.upgrades[u.id] && !isRedundant(state, u) && u.req.every((r) => meets(state, r)),
  );
}

/** An era ticket is pointless once that era is already open (e.g. via 时代记忆). */
function isRedundant(state: GameState, u: UpgradeDef): boolean {
  return u.effects.some((e) => e.type === 'unlockEra' && e.era <= state.era);
}

export function isCreatureUnlocked(state: GameState, id: CreatureId): boolean {
  const def = CREATURES.find((c) => c.id === id);
  return !!def && def.era <= state.era;
}

/**
 * A creature row is shown when its era is unlocked and either it is owned
 * or the previous creature in the list has been bought. Keeps the list short early on.
 */
export function isCreatureVisible(state: GameState, id: CreatureId): boolean {
  const idx = CREATURES.findIndex((c) => c.id === id);
  const def = CREATURES[idx];
  if (!def || def.era > state.era) return false;
  if (idx === 0 || state.creatures[id].bought > 0) return true;
  const prev = CREATURES[idx - 1]!;
  return state.creatures[prev.id].bought > 0 || prev.era < def.era;
}

export function geneLevel(state: GameState, id: string): number {
  return state.geneLevels[id] ?? 0;
}

export function geneUnlocked(state: GameState, def: GeneUpgradeDef): boolean {
  if (!def.req) return true;
  return geneLevel(state, def.req.gene) >= def.req.level;
}

export function availableGenes(state: GameState): GeneUpgradeDef[] {
  return GENE_UPGRADES.filter((g) => geneUnlocked(state, g));
}

export function genesFree(state: GameState): number {
  return state.genes - state.genesSpent;
}
