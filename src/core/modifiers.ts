import { BALANCE } from './config/balance.ts';
import { CLASSES } from './config/classes.ts';
import { DISASTERS } from './config/disasters.ts';
import { META_BY_ID, ROUTES } from './config/meta.ts';
import { SKILL_BY_ID } from './config/skills.ts';
import type { GameState, MetaState, RunState } from './state.ts';
import { CLASS_IDS, type ActiveId, type Effect, type NatureBuildingId, type RouteId, type UnitClass } from './types.ts';

/** Everything skills, meta, route, countermeasures and disasters change, flattened for the hot paths. */
export interface Mods {
  classAtk: Record<UnitClass, number>;
  globalAtk: number;
  classHp: Record<UnitClass, number>;
  globalHp: number;
  classLife: Record<UnitClass, number>;
  globalLife: number;
  /** 0 … 0.95 share of each countermeasure a class shrugs off. */
  resist: Record<UnitClass, number>;
  convertMult: number;
  productionMult: number;
  regenMult: number;
  bubbleMult: number;
  bubbleRate: number;
  incomeMult: number;
  researchMult: number;
  domesticationMult: number;
  tide: boolean;
  tideAmp: number;
  surgeDuration: number;
  surgeCooldown: number;
  actives: Record<ActiveId, boolean>;
  /** Nature buildings opened by skills. */
  unlocked: Partial<Record<NatureBuildingId, true>>;
  /** Nature buildings allowed on human ground. */
  enemyGround: Partial<Record<NatureBuildingId, true>>;
  capAdd: number;
  wildBuild: number;
  /** Points per second nature ground creeps into neutral neighbours. */
  spread: number;
  swarmBatch: number;
  startEssence: number;
  forksUnlocked: Record<string, boolean>;
  routesUnlocked: Record<RouteId, boolean>;
  /** Attack each class keeps after the humans' countermeasures. */
  countered: Record<UnitClass, number>;
  /** The class a raging disaster lifts, if any. */
  boost: { cls: UnitClass; x: number } | null;
}

function base(): Mods {
  const one = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 1])) as Record<K, number>;
  return {
    classAtk: one(CLASS_IDS),
    globalAtk: 1,
    classHp: one(CLASS_IDS),
    globalHp: 1,
    classLife: one(CLASS_IDS),
    globalLife: 1,
    resist: Object.fromEntries(CLASS_IDS.map((c) => [c, CLASSES[c].resist])) as Record<UnitClass, number>,
    convertMult: 1,
    productionMult: 1,
    regenMult: 1,
    bubbleMult: 1,
    bubbleRate: 1,
    incomeMult: 1,
    researchMult: 1,
    domesticationMult: 1,
    tide: false,
    tideAmp: BALANCE.tide.baseAmp,
    surgeDuration: BALANCE.tide.surgeDuration,
    surgeCooldown: BALANCE.tide.surgeCooldown,
    actives: { surge: false, rescue: false, rampage: false, sabotage: false },
    unlocked: {},
    enemyGround: {},
    capAdd: 0,
    wildBuild: 1,
    spread: 0,
    swarmBatch: 0,
    startEssence: 0,
    forksUnlocked: {},
    routesUnlocked: { beasts: true, plague: false },
    countered: one(CLASS_IDS),
    boost: null,
  };
}

function apply(m: Mods, e: Effect): void {
  switch (e.type) {
    case 'classAtk':
      m.classAtk[e.cls] *= e.x;
      break;
    case 'globalAtk':
      m.globalAtk *= e.x;
      break;
    case 'classHp':
      m.classHp[e.cls] *= e.x;
      break;
    case 'globalHp':
      m.globalHp *= e.x;
      break;
    case 'classLife':
      m.classLife[e.cls] *= e.x;
      break;
    case 'globalLife':
      m.globalLife *= e.x;
      break;
    case 'classResist':
      m.resist[e.cls] += e.add;
      break;
    case 'convertMult':
      m.convertMult *= e.x;
      break;
    case 'productionMult':
      m.productionMult *= e.x;
      break;
    case 'regenMult':
      m.regenMult *= e.x;
      break;
    case 'bubbleMult':
      m.bubbleMult *= e.x;
      break;
    case 'bubbleRate':
      m.bubbleRate *= e.x;
      break;
    case 'incomeMult':
      m.incomeMult *= e.x;
      break;
    case 'researchMult':
      m.researchMult *= e.x;
      break;
    case 'domesticationMult':
      m.domesticationMult *= e.x;
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
    case 'unlockBuilding':
      m.unlocked[e.id] = true;
      break;
    case 'enemyGround':
      m.enemyGround[e.id] = true;
      break;
    case 'capAdd':
      m.capAdd += e.add;
      break;
    case 'wildBuildMult':
      m.wildBuild *= e.x;
      break;
    case 'spread':
      m.spread += e.rate;
      break;
    case 'swarmBatch':
      m.swarmBatch += e.add;
      break;
    case 'convert':
      // A one-off change, applied when bought.
      break;
  }
}

/** Meta-only part: forks, routes and starting 自然之元 matter before a run exists. */
export function metaMods(meta: MetaState, into: Mods = base()): Mods {
  for (const [id, level] of Object.entries(meta.levels)) {
    const def = META_BY_ID[id];
    if (!def) continue;
    for (let i = 0; i < level && i < def.levels.length; i++) {
      for (const e of def.levels[i]!.effects) {
        switch (e.type) {
          case 'productionMult':
            into.productionMult *= e.x;
            break;
          case 'globalLife':
            into.globalLife *= e.x;
            break;
          case 'researchMult':
            into.researchMult *= e.x;
            break;
          case 'domesticationMult':
            into.domesticationMult *= e.x;
            break;
          case 'startEssence':
            into.startEssence = Math.max(into.startEssence, e.amount);
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
  for (const c of CLASS_IDS) m.resist[c] = Math.min(0.95, Math.max(0, m.resist[c]));
  for (const cm of run.countermeasures) m.countered[cm.cls] *= 1 - BALANCE.research.countermeasure * (1 - m.resist[cm.cls]);
  const d = run.disaster;
  m.boost = d && d.phase === 'active' ? DISASTERS[d.id].boost : null;
  return m;
}
