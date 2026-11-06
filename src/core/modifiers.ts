import { BALANCE } from './config/balance.ts';
import { CLASSES } from './config/classes.ts';
import { CREATURE_IDS } from './config/creatures.ts';
import { DOMESTIC_EFFECTS } from './config/humans.ts';
import { META_BY_ID, ROUTES } from './config/meta.ts';
import { SKILL_BY_ID } from './config/skills.ts';
import { UPGRADE_BY_ID } from './config/upgrades.ts';
import type { GameState, MetaState, RunState } from './state.ts';
import { CLASS_IDS, type ActiveId, type CreatureId, type Effect, type RouteId, type UnitClass } from './types.ts';

/** Everything skills, upgrades, meta, route and humans change, flattened for the hot paths. */
export interface Mods {
  creatureMult: Record<CreatureId, number>;
  classMult: Record<UnitClass, number>;
  globalMult: number;
  /** 0..0.95 share of each countermeasure a class shrugs off. */
  resist: Record<UnitClass, number>;
  clickMult: number;
  clickPct: number;
  researchMult: number;
  domesticationMult: number;
  breeding: boolean;
  breedMult: number;
  tide: boolean;
  tideAmp: number;
  surgeDuration: number;
  surgeCooldown: number;
  actives: Record<ActiveId, boolean>;
  startMoney: number;
  forksUnlocked: Record<string, boolean>;
  routesUnlocked: Record<RouteId, boolean>;
  /** Hunters move faster once they have dogs. */
  dogs: boolean;
}

function base(): Mods {
  const one = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 1])) as Record<K, number>;
  return {
    creatureMult: one(CREATURE_IDS),
    classMult: one(CLASS_IDS),
    globalMult: 1,
    resist: Object.fromEntries(CLASS_IDS.map((c) => [c, CLASSES[c].resist])) as Record<UnitClass, number>,
    clickMult: 1,
    clickPct: 0,
    researchMult: 1,
    domesticationMult: 1,
    breeding: false,
    breedMult: 1,
    tide: false,
    tideAmp: BALANCE.tide.baseAmp,
    surgeDuration: BALANCE.tide.surgeDuration,
    surgeCooldown: BALANCE.tide.surgeCooldown,
    actives: { surge: false, rescue: false, rampage: false, sabotage: false },
    startMoney: 0,
    forksUnlocked: {},
    routesUnlocked: { beasts: true, plague: false },
    dogs: false,
  };
}

function apply(m: Mods, e: Effect): void {
  switch (e.type) {
    case 'creatureMult':
      m.creatureMult[e.creature] *= e.x;
      break;
    case 'classMult':
      m.classMult[e.cls] *= e.x;
      break;
    case 'globalMult':
      m.globalMult *= e.x;
      break;
    case 'classResist':
      m.resist[e.cls] += e.add;
      break;
    case 'clickMult':
      m.clickMult *= e.x;
      break;
    case 'clickPct':
      m.clickPct += e.add;
      break;
    case 'researchMult':
      m.researchMult *= e.x;
      break;
    case 'domesticationMult':
      m.domesticationMult *= e.x;
      break;
    case 'unlockBreeding':
      m.breeding = true;
      break;
    case 'breedMult':
      m.breedMult *= e.x;
      break;
    case 'unlockTide':
      m.tide = true;
      break;
    case 'tideAmp':
      m.tideAmp += e.add;
      break;
    case 'surgeDuration':
      m.surgeDuration += e.add;
      break;
    case 'surgeCooldownMult':
      m.surgeCooldown *= e.x;
      break;
    case 'unlockActive':
      m.actives[e.id] = true;
      break;
    case 'convert':
    case 'unlockEra':
      // One-off state changes, applied when bought.
      break;
  }
}

/** Meta-only part: forks, routes and starting money matter before a run exists. */
export function metaMods(meta: MetaState, into: Mods = base()): Mods {
  for (const [id, level] of Object.entries(meta.levels)) {
    const def = META_BY_ID[id];
    if (!def) continue;
    for (let i = 0; i < level && i < def.levels.length; i++) {
      for (const e of def.levels[i]!.effects) {
        switch (e.type) {
          case 'globalMult':
            into.globalMult *= e.x;
            break;
          case 'researchMult':
            into.researchMult *= e.x;
            break;
          case 'domesticationMult':
            into.domesticationMult *= e.x;
            break;
          case 'startMoney':
            into.startMoney = Math.max(into.startMoney, e.amount);
            break;
          case 'unlockFork':
            into.forksUnlocked[e.group] = true;
            break;
          case 'unlockRoute':
            into.routesUnlocked[e.route] = true;
            break;
        }
      }
    }
  }
  return into;
}

export function computeMods(state: GameState): Mods {
  const m = metaMods(state.meta);
  const run: RunState = state.run;
  for (const e of ROUTES[run.route].effects) apply(m, e);
  for (const id of Object.keys(run.skills)) {
    const def = SKILL_BY_ID[id];
    if (def) for (const e of def.effects) apply(m, e);
  }
  for (const id of Object.keys(run.upgrades)) {
    const def = UPGRADE_BY_ID[id];
    if (def) for (const e of def.effects) apply(m, e);
  }
  // Animals the humans tamed from you work against you.
  if (run.defected.wolf !== undefined) {
    m.dogs = true;
    m.classMult.hunter *= DOMESTIC_EFFECTS.dogHunterMult;
  }
  if (run.defected.wildcat !== undefined) m.classMult.swarm *= DOMESTIC_EFFECTS.catSwarmMult;
  if (run.defected.boar !== undefined) {
    m.globalMult *= DOMESTIC_EFFECTS.pigGlobalMult;
    m.researchMult *= 1 + BALANCE.research.pigBoost;
  }
  for (const c of CLASS_IDS) m.resist[c] = Math.min(0.95, Math.max(0, m.resist[c]));
  // Countermeasures already fielded.
  for (const cm of run.countermeasures) {
    m.classMult[cm.cls] *= 1 - BALANCE.research.countermeasure * (1 - m.resist[cm.cls]);
  }
  return m;
}
