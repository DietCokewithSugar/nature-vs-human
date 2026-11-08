import { BALANCE } from '../config/balance.ts';
import { BUILDINGS } from '../config/buildings.ts';
import { PICK_BY_ID } from '../config/picks.ts';
import { TALENTS, type TalentId } from '../config/talents.ts';
import { UNITS } from '../config/units.ts';
import type { MetaState, RunState } from '../state.ts';
import { NATURE_UNIT_IDS, type BuildingId, type LevelId, type NatureUnitId, type UnitId } from '../types.ts';

/** Everything picks and talents change, folded into multipliers. */
export interface Mods {
  hp: Record<NatureUnitId, number>;
  atk: Record<NatureUnitId, number>;
  speed: number;
  spawnRate: number;
  grass: number;
  meatYield: number;
  /** Share of the predators' meal they no longer need. */
  predatorEat: number;
  bounty: number;
  buildingHp: number;
  income: number;
  pack: number;
  charge: number;
  towerDmg: number;
  antBuilding: number;
  motherHp: number;
  startEssence: number;
  rerolls: number;
}

function ones(): Record<NatureUnitId, number> {
  return Object.fromEntries(NATURE_UNIT_IDS.map((id) => [id, 1])) as Record<NatureUnitId, number>;
}

export function computeMods(run: RunState, meta: MetaState): Mods {
  const t = (id: TalentId) => meta.talents[id] * TALENTS[id].per;
  const m: Mods = {
    hp: ones(),
    atk: ones(),
    speed: 1,
    spawnRate: 1,
    grass: 1 + t('bloom'),
    meatYield: 1,
    predatorEat: 0,
    bounty: 1,
    buildingHp: 1,
    income: 1,
    pack: 1,
    charge: 0,
    towerDmg: 1,
    antBuilding: 0,
    motherHp: 1 + t('roots'),
    startEssence: t('soil'),
    rerolls: t('choice'),
  };
  for (const id of NATURE_UNIT_IDS) {
    m.hp[id] += t('hides');
    m.atk[id] += t('claws');
  }
  for (const pid of run.picks) {
    const e = PICK_BY_ID[pid]?.effect;
    if (!e) continue;
    switch (e.kind) {
      case 'unitHp':
        m.hp[e.unit] += e.add;
        break;
      case 'unitAtk':
        m.atk[e.unit] += e.add;
        break;
      case 'unitSpeed':
        m.speed += e.add;
        break;
      case 'spawnRate':
        m.spawnRate += e.add;
        break;
      case 'grass':
        m.grass += e.add;
        break;
      case 'meatYield':
        m.meatYield += e.add;
        break;
      case 'predatorEat':
        m.predatorEat += e.add;
        break;
      case 'bounty':
        m.bounty += e.add;
        break;
      case 'buildingHp':
        m.buildingHp += e.add;
        break;
      case 'income':
        m.income += e.add;
        break;
      case 'packBonus':
        m.pack += e.add;
        break;
      case 'chargeMult':
        m.charge += e.add;
        break;
      case 'towerDmg':
        m.towerDmg += e.add;
        break;
      case 'antBuilding':
        m.antBuilding += e.add;
        break;
    }
  }
  m.predatorEat = Math.min(0.75, m.predatorEat);
  return m;
}

/** Health and attack multiplier of a level. */
export function levelMult(level: number): number {
  return Math.pow(1 + BALANCE.levelPower, Math.max(0, level - 1));
}

/** The humans' unit level: their stage start plus the research done this stage. */
export function humanLevel(run: RunState): number {
  return 1 + BALANCE.human.levelsPerStage * (run.stage - 1) + run.human.research;
}

/** Humans' buildings are as tough as the stage they start in (research doesn't harden them). */
export function humanBuildingLevel(run: RunState): number {
  return 1 + BALANCE.human.levelsPerStage * (run.stage - 1);
}

export function unitMaxHp(kind: UnitId, run: RunState, mods: Mods): number {
  const def = UNITS[kind];
  if (def.side === 'nature') {
    const k = kind as NatureUnitId;
    return def.hp * levelMult(run.levels[k]) * mods.hp[k];
  }
  return def.hp * levelMult(humanLevel(run));
}

export function unitAtk(kind: UnitId, run: RunState, mods: Mods): number {
  const def = UNITS[kind];
  if (def.side === 'nature') {
    const k = kind as NatureUnitId;
    return def.atk * levelMult(run.levels[k]) * mods.atk[k];
  }
  return def.atk * levelMult(humanLevel(run));
}

export function unitSpeed(kind: UnitId, mods: Mods): number {
  const def = UNITS[kind];
  return def.side === 'nature' ? def.speed * mods.speed : def.speed;
}

/** What a unit eats per second, after picks. */
export function unitEat(kind: UnitId, mods: Mods): number {
  const def = UNITS[kind];
  if (def.diet === 'meat') return def.eat * (1 - mods.predatorEat);
  return def.eat;
}

export function unitMeat(kind: UnitId, mods: Mods): number {
  return UNITS[kind].meat * mods.meatYield;
}

export function buildingMaxHp(kind: BuildingId, run: RunState, mods: Mods): number {
  const def = BUILDINGS[kind];
  if (def.side === 'human') {
    const base = def.hp * levelMult(humanBuildingLevel(run));
    return def.main ? def.hp * Math.pow(BALANCE.human.mainHpGrowth, run.stage - 1) : base;
  }
  let hp = def.hp * mods.buildingHp;
  if (kind === 'mothertree') hp *= (1 + BALANCE.motherHpPerLevel * (run.levels.mothertree - 1)) * mods.motherHp;
  if (kind === 'ancient') hp *= levelMult(run.levels.ancient);
  return hp;
}

export function towerDmg(kind: BuildingId, run: RunState, mods: Mods): number {
  const def = BUILDINGS[kind];
  const base = def.tower?.dmg ?? 0;
  if (def.side === 'human') return base * levelMult(humanLevel(run));
  const level = kind === 'ancient' ? run.levels.ancient : run.levels.mothertree;
  return base * levelMult(level) * mods.towerDmg;
}

export function spawnInterval(kind: BuildingId, mods: Mods): number {
  const def = BUILDINGS[kind];
  const base = def.interval ?? Infinity;
  return def.side === 'nature' ? base / mods.spawnRate : base;
}

/** Grass one meadow makes per second. */
export function meadowGrass(run: RunState, mods: Mods): number {
  return (BUILDINGS.meadow.grass ?? 0) * Math.pow(1 + BALANCE.meadowPerLevel, run.levels.meadow - 1) * mods.grass;
}

export function motherIncome(run: RunState, mods: Mods): number {
  return ((BUILDINGS.mothertree.income ?? 0) + BALANCE.motherIncomePerLevel * (run.levels.mothertree - 1)) * mods.income;
}

/** Price of the next level of something nature levels. */
export function levelCost(id: LevelId, level: number): number {
  return Math.ceil(BALANCE.levelCost[id] * Math.pow(BALANCE.levelCostGrowth, level - 1));
}
