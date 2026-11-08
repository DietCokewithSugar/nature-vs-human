import { BUILDINGS } from './config/buildings.ts';
import { DIFFICULTY_GATE, META_UPGRADES } from './config/meta.ts';
import { SKILLS } from './config/skills.ts';
import type { Mods } from './modifiers.ts';
import type { MetaState, RunState } from './state.ts';
import type { CreatureId, Difficulty, MetaUpgradeDef, Requirement, SkillDef } from './types.ts';

export function forkTaken(run: RunState, group: string): 'A' | 'B' | null {
  for (const s of SKILLS) if (s.fork?.group === group && run.skills[s.id]) return s.fork.side;
  return null;
}

/** Own buildings that make a species. */
export function homesOf(run: RunState, creature: CreatureId): number {
  let n = 0;
  for (const b of run.buildings) {
    if (b.side === 'nature' && BUILDINGS[b.kind].spawns.some((s) => s.unit === creature)) n++;
  }
  return n;
}

export function meets(run: RunState, r: Requirement): boolean {
  switch (r.type) {
    case 'era':
      return run.era >= r.era;
    case 'skill':
      return run.skills[r.id] === true;
    case 'fork':
      return forkTaken(run, r.group) !== null;
    case 'homes':
      return homesOf(run, r.creature) >= r.n;
    case 'notDefected':
      return run.defected[r.creature] === undefined;
  }
}

export type SkillStatus = 'owned' | 'available' | 'locked' | 'forkLocked' | 'forkClosed';

/**
 * owned: bought. available: requirements met. locked: requirements not met yet.
 * forkLocked: side B not unlocked with meta points. forkClosed: the other side was picked.
 */
export function skillStatus(run: RunState, mods: Mods, s: SkillDef): SkillStatus {
  if (run.skills[s.id]) return 'owned';
  if (s.fork) {
    const taken = forkTaken(run, s.fork.group);
    if (taken && taken !== s.fork.side) return 'forkClosed';
    if (s.fork.side === 'B' && !mods.forksUnlocked[s.fork.group]) return 'forkLocked';
  }
  return s.req.every((r) => meets(run, r)) ? 'available' : 'locked';
}

export function metaLevel(meta: MetaState, id: string): number {
  return meta.levels[id] ?? 0;
}

export function metaFree(meta: MetaState): number {
  return meta.points - meta.spent;
}

export function metaShop(): readonly MetaUpgradeDef[] {
  return META_UPGRADES;
}

export function difficultyUnlocked(meta: MetaState, d: Difficulty): boolean {
  const gate = DIFFICULTY_GATE[d];
  return gate === null || meta.wins[gate] > 0;
}
