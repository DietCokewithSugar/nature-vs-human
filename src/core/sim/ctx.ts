import { BALANCE } from '../config/balance.ts';
import { BUILDINGS } from '../config/buildings.ts';
import { UNITS } from '../config/units.ts';
import { LANE_HALF, LANE_Y, MAINS, PADS, segmentAt } from '../map/layout.ts';
import { nextRandom } from '../rng.ts';
import type { Building, MetaState, RunState, Unit } from '../state.ts';
import type { BuildingId, Lane, Owner, Side, UnitId } from '../types.ts';
import type { CoreEvent } from './events.ts';
import { buildingMaxHp, unitMaxHp, type Mods } from './stats.ts';

/** What every part of the simulation works with during a step. */
export interface Ctx {
  run: RunState;
  meta: MetaState;
  mods: Mods;
  emit: (e: CoreEvent) => void;
  /** Units and buildings by id, rebuilt at the start of each step. */
  byId: Map<number, Unit | Building>;
}

export function rand(ctx: Ctx): number {
  return nextRandom(ctx.run);
}

export function isUnit(e: Unit | Building): e is Unit {
  return 'lane' in e;
}

export function ownerOf(control: number): Owner {
  if (control >= BALANCE.territory.flip) return 'nature';
  if (control <= -BALANCE.territory.flip) return 'human';
  return 'neutral';
}

export function segOwner(run: RunState, lane: Lane, seg: number): Owner {
  return ownerOf(run.segments[lane]![seg]!);
}

/** Who may build on a pad right now. */
export function padUser(run: RunState, padId: number): Side | null {
  const pad = PADS[padId];
  if (!pad) return null;
  if (pad.home) return pad.home;
  const o = segOwner(run, pad.lane, pad.seg);
  return o === 'neutral' ? null : o;
}

export function buildingOnPad(run: RunState, padId: number): Building | undefined {
  return run.buildings.find((b) => b.pad === padId);
}

export function mainOf(run: RunState, side: Side): Building | undefined {
  return run.buildings.find((b) => b.side === side && b.pad === -1);
}

export function addBuilding(ctx: Ctx, kind: BuildingId, padId: number, done: boolean): Building {
  const def = BUILDINGS[kind];
  const site = padId < 0 ? MAINS[def.side] : PADS[padId]!;
  const maxHp = buildingMaxHp(kind, ctx.run, ctx.mods);
  const b: Building = {
    id: ctx.run.nextId++,
    kind,
    side: def.side,
    pad: padId,
    x: site.x,
    y: site.y,
    hp: done ? maxHp : maxHp * 0.1,
    maxHp,
    progress: done ? 1 : 0,
    timer: 0,
    blocked: null,
    hitAt: -99,
    nextLane: 1,
  };
  ctx.run.buildings.push(b);
  ctx.byId.set(b.id, b);
  return b;
}

export function addUnit(ctx: Ctx, kind: UnitId, lane: Lane, x: number, y: number): Unit {
  const def = UNITS[kind];
  const maxHp = unitMaxHp(kind, ctx.run, ctx.mods);
  const off = Math.round((rand(ctx) * 2 - 1) * (LANE_HALF - def.r - 6));
  const u: Unit = {
    id: ctx.run.nextId++,
    kind,
    side: def.side,
    lane,
    x,
    y,
    off,
    hp: maxHp,
    maxHp,
    target: 0,
    cd: rand(ctx) * 0.5,
    look: rand(ctx) * BALANCE.retarget,
    fought: -99,
    hitAt: -99,
    struckAt: -99,
    face: def.side === 'nature' ? 1 : -1,
    hungry: false,
  };
  ctx.run.units.push(u);
  ctx.byId.set(u.id, u);
  ctx.emit({ type: 'spawn', id: u.id, kind, side: u.side });
  return u;
}

/** Where a unit is on the map: its lane and stretch, if it's in the field. */
export function unitSegment(u: Unit): number {
  if (Math.abs(u.y - LANE_Y[u.lane]) > LANE_HALF + 4) return -1;
  return segmentAt(u.x);
}
