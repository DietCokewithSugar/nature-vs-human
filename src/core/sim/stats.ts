import { BALANCE } from '../config/balance.ts';
import { BUILDINGS, LEVELS } from '../config/buildings.ts';
import { UNITS, type UnitDef } from '../config/units.ts';
import type { Mods } from '../modifiers.ts';
import type { Building, RunState, Unit } from '../state.ts';
import type { BuildingId, Side, UnitId } from '../types.ts';
import { tideMult } from './tide.ts';
import type { World } from './world.ts';

/** Max HP of a unit kind for its side. */
export function unitMaxHp(run: RunState, mods: Mods, kind: UnitId): number {
  const def = UNITS[kind];
  if (def.side === 'human') return def.hp * BALANCE.difficulty[run.difficulty].hp;
  return def.hp * mods.globalHp * (def.cls ? mods.classHp[def.cls] : 1);
}

/** Lifespan multiplier for a kind (nature only: skills are the only way to live longer). */
export function lifeMult(mods: Mods, def: UnitDef): number {
  if (def.side === 'human') return 1;
  return mods.globalLife * (def.cls ? mods.classLife[def.cls] : 1);
}

/** Damage of one hit by a unit, before target multipliers. */
export function unitAtk(run: RunState, mods: Mods, u: Unit): number {
  const def = UNITS[u.kind];
  if (def.side === 'human') return def.atk;
  let x = def.atk * mods.globalAtk;
  if (def.cls) {
    x *= mods.classAtk[def.cls] * mods.countered[def.cls];
    if (def.cls === 'tank' && run.rampageLeft > 0) x *= BALANCE.actives.rampage.mult;
    if (def.cls === 'marine') x *= tideMult(run.tide, mods);
    if (mods.boost && mods.boost.cls === def.cls) x *= mods.boost.x;
  }
  return x;
}

export function buildingMaxHp(run: RunState, b: Building): number {
  const def = BUILDINGS[b.kind];
  const diff = def.side === 'human' ? BALANCE.difficulty[run.difficulty].hp : 1;
  return def.hp * LEVELS.hp[b.level - 1]! * diff;
}

/** Living units a building keeps. */
export function maxAlive(b: Building): number {
  const def = BUILDINGS[b.kind];
  return Math.round(def.alive * LEVELS.alive[b.level - 1]!);
}

/** Seconds between births at the building's level and the side's production speed. */
export function birthInterval(mods: Mods, b: Building): number {
  const def = BUILDINGS[b.kind];
  const speed = LEVELS.speed[b.level - 1]! * (def.side === 'nature' ? mods.productionMult : 1);
  return def.interval / speed;
}

export function owned(run: RunState, side: Side, kind: BuildingId): number {
  let n = 0;
  for (const b of run.buildings) if (b.side === side && b.kind === kind) n++;
  return n;
}

/** Price of the next building of a kind. */
export function buildingCost(run: RunState, kind: BuildingId): number {
  const def = BUILDINGS[kind];
  return Math.round(def.cost * BALANCE.economy.costGrowth ** owned(run, def.side, kind));
}

/** Price to take a building from its level to the next, or null at the top. */
export function upgradeCost(b: Building): number | null {
  if (b.level >= LEVELS.max) return null;
  return Math.round(BUILDINGS[b.kind].cost * LEVELS.price[b.level - 1]!);
}

/** Building slots for a side, from the ground it holds. */
export function buildingCap(world: World, mods: Mods, side: Side): number {
  const C = BALANCE.caps;
  if (side === 'nature') return C.natureBase + Math.floor(world.held.nature / C.naturePerCells) + mods.capAdd;
  return C.humanBase + Math.floor(world.held.human / C.humanPerCells);
}

export function buildingCount(run: RunState, side: Side): number {
  let n = 0;
  for (const b of run.buildings) if (b.side === side) n++;
  return n;
}

/** Seconds to build at full speed. */
export function buildTime(kind: BuildingId): number {
  return BALANCE.build.base + BUILDINGS[kind].cost / BALANCE.build.perCost;
}
