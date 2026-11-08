import { BALANCE } from '../config/balance.ts';
import { CELLS, CELL_COUNT, isOpen, neighbors4 } from '../map/grid.ts';
import type { Mods } from '../modifiers.ts';
import type { RunState } from '../state.ts';
import type { Owner, Side } from '../types.ts';
import { HUMAN, NATURE, NEUTRAL, type World } from './world.ts';

const T = BALANCE.territory;

export function ownerCode(o: Owner): number {
  return o === 'nature' ? NATURE : o === 'human' ? HUMAN : NEUTRAL;
}

export function ownerOf(code: number): Owner {
  return code === NATURE ? 'nature' : code === HUMAN ? 'human' : 'neutral';
}

/** Lay the map's starting holders onto a fresh run. */
export function initCells(run: RunState): void {
  run.control = CELLS.map((c) => (c.start === 'nature' ? T.max : c.start === 'human' ? -T.max : 0));
  run.owner = CELLS.map((c) => ownerCode(c.start));
  run.worked = CELLS.map(() => 99);
}

/** Push a cell towards a side. `rate` is points per second before neutral ground's resistance. */
export function workCell(run: RunState, side: Side, k: number, rate: number, dt: number): void {
  if (!CELLS[k]!.claimable) return;
  const resist = run.owner[k] === NEUTRAL ? T.neutralResist : 1;
  const sign = side === 'nature' ? 1 : -1;
  run.control[k] = Math.max(-T.max, Math.min(T.max, run.control[k]! + sign * rate * resist * dt));
  run.worked[k] = 0;
}

/**
 * Drift, claims and hand-overs. Held ground drifts back to its holder when nobody works it;
 * finished buildings hold their own cell; with the 蔓生 skill nature creeps into neutral ground.
 * A cell with a building standing on it cannot change hands until the building falls.
 */
export function stepTerritory(run: RunState, world: World, mods: Mods, dt: number): { toNature: number; toHuman: number } {
  const control = run.control;
  const owner = run.owner;
  let toNature = 0;
  let toHuman = 0;
  for (let k = 0; k < CELL_COUNT; k++) {
    const c = CELLS[k]!;
    if (!c.claimable || !isOpen(run.era, k)) continue;
    run.worked[k] = run.worked[k]! + dt;
    let v = control[k]!;
    const o = owner[k]!;
    const b = world.byCell[k];
    if (b && b.build >= 1) {
      const pole = b.side === 'nature' ? T.max : -T.max;
      v += Math.sign(pole - v) * Math.min(Math.abs(pole - v), T.buildingClaim * dt);
    } else if (run.worked[k]! > T.recoverDelay) {
      const pole = o === NATURE ? T.max : o === HUMAN ? -T.max : 0;
      v += Math.sign(pole - v) * Math.min(Math.abs(pole - v), T.recover * dt);
    }
    if (mods.spread > 0 && o === NEUTRAL) {
      let n = 0;
      for (const m of neighbors4(k)) if (owner[m] === NATURE) n++;
      v += (mods.spread * n * dt) / 4;
    }
    if (b) v = b.side === 'human' ? Math.min(v, T.flip - 1) : Math.max(v, -T.flip + 1);
    control[k] = Math.max(-T.max, Math.min(T.max, v));
    if (o !== NATURE && v >= T.flip) {
      owner[k] = NATURE;
      toNature++;
    } else if (o !== HUMAN && v <= -T.flip) {
      owner[k] = HUMAN;
      toHuman++;
    }
  }
  if (toNature || toHuman) world.countCells(run);
  return { toNature, toHuman };
}

/** Nature's share of the open, holdable ground. */
export function natureShare(world: World): number {
  return world.held.total ? world.held.nature / world.held.total : 0;
}

export function humanShare(world: World): number {
  return world.held.total ? world.held.human / world.held.total : 0;
}
