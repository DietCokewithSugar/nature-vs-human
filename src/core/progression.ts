import { CREATURES } from './config/creatures.ts';
import { DIFFICULTY_GATE, META_UPGRADES } from './config/meta.ts';
import { SKILLS } from './config/skills.ts';
import { UPGRADES } from './config/upgrades.ts';
import type { Mods } from './modifiers.ts';
import type { MetaState, RunState } from './state.ts';
import type { CreatureId, Difficulty, MetaUpgradeDef, Requirement, SkillDef, UpgradeDef } from './types.ts';

export function forkTaken(run: RunState, group: string): 'A' | 'B' | null {
  for (const s of SKILLS) if (s.fork?.group === group && run.skills[s.id]) return s.fork.side;
  return null;
}

export function meets(run: RunState, r: Requirement): boolean {
  switch (r.type) {
    case 'owned':
      return run.creatures[r.creature].bought + run.creatures[r.creature].bred >= r.n;
    case 'era':
      return run.era >= r.era;
    case 'skill':
      return run.skills[r.id] === true;
    case 'fork':
      return forkTaken(run, r.group) !== null;
    case 'upgrade':
      return run.upgrades[r.id] === true;
    case 'runEarned':
      return run.earned.gt(0) && run.earned.log10() >= r.log10;
    case 'notDefected':
      return run.defected[r.creature] === undefined;
  }
}

// ── Upgrades ────────────────────────────────────────────────────

function redundant(run: RunState, u: UpgradeDef): boolean {
  return u.effects.some((e) => e.type === 'unlockEra' && e.era <= run.era);
}

export function availableUpgrades(run: RunState): UpgradeDef[] {
  return UPGRADES.filter((u) => !run.upgrades[u.id] && !redundant(run, u) && u.req.every((r) => meets(run, r)));
}

// ── Skills ──────────────────────────────────────────────────────

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

// ── Creatures ───────────────────────────────────────────────────

export function isCreatureUnlocked(run: RunState, id: CreatureId): boolean {
  const def = CREATURES.find((c) => c.id === id);
  return !!def && def.era <= run.era && run.defected[id] === undefined;
}

/** Shown once its era is open and the previous creature was bought; defected species stay listed. */
export function isCreatureVisible(run: RunState, id: CreatureId): boolean {
  const idx = CREATURES.findIndex((c) => c.id === id);
  const def = CREATURES[idx];
  if (!def || def.era > run.era) return false;
  const c = run.creatures[id];
  if (idx === 0 || c.bought + c.bred > 0 || run.defected[id] !== undefined) return true;
  const prev = CREATURES[idx - 1]!;
  const p = run.creatures[prev.id];
  return p.bought + p.bred > 0 || prev.era < def.era || run.defected[prev.id] !== undefined;
}

// ── Meta ────────────────────────────────────────────────────────

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
