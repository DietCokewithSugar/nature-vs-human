import { BALANCE } from '../config/balance.ts';
import { UNITS } from '../config/units.ts';
import { CELL, CELLS, GRID, cellAt, cxOf, cyOf, idx } from '../map/grid.ts';
import { UNREACHABLE } from '../map/nav.ts';
import type { Unit } from '../state.ts';
import { mainOf, mapOf, navOf, type Ctx } from './ctx.ts';

/**
 * Where units go when there's nothing to fight. Nobody is steered by hand:
 *
 * - Nature, with no flags out: take ground. Each unit looks round itself for the best cell that
 *   isn't nature's yet (or hasn't been seen), preferring cells nearer the humans' capital, cells
 *   with a human building it has seen, and cells fewer of its kind are already heading for. So the
 *   army spreads along the front, pushes the fog back and creeps towards the capital.
 * - Nature, with flags out: head for the nearest flag, then take the ground round it.
 * - Human gatherers: take the nearest ground that isn't the humans', leaning towards nature.
 * - Human soldiers: march on the nearest of nature's buildings.
 */

/** How many units of each side are heading for each cell (rebuilt every step). */
export const crowd = { nature: new Int16Array(CELLS), human: new Int16Array(CELLS) };
/** Cells with a human building nature has seen (rebuilt every step). */
const seenAt = new Set<number>();

export function countCrowd(ctx: Ctx): void {
  crowd.nature.fill(0);
  crowd.human.fill(0);
  for (const u of ctx.run.units) if (u.goal >= 0 && u.hp > 0) crowd[u.side][u.goal]!++;
  seenAt.clear();
  for (const b of ctx.run.buildings) if (b.side === 'human' && b.seen) seenAt.add(b.cell);
}

function scan(cx0: number, cy0: number, r: number, fn: (i: number, d: number) => void): void {
  for (let dy = -r; dy <= r; dy++) {
    const cy = cy0 + dy;
    if (cy < 0 || cy >= GRID) continue;
    for (let dx = -r; dx <= r; dx++) {
      const cx = cx0 + dx;
      if (cx < 0 || cx >= GRID) continue;
      fn(idx(cx, cy), Math.hypot(dx, dy));
    }
  }
}

/** Pick a goal cell for a unit with nothing to fight. */
export function chooseGoal(ctx: Ctx, u: Unit): number {
  if (u.side === 'nature') return natureGoal(ctx, u);
  return UNITS[u.kind].special === 'gather' ? gathererGoal(ctx, u) : soldierGoal(ctx, u);
}

/** Is a goal finished, so the unit should pick another one right away? */
export function goalDone(ctx: Ctx, u: Unit): boolean {
  const run = ctx.run;
  if (u.goal < 0) return true;
  const flip = BALANCE.territory.flip;
  // Taking ground: done once it's nature's (and has been seen).
  if (u.side === 'nature') return run.control[u.goal]! >= flip && run.explored[u.goal] === 1;
  if (UNITS[u.kind].special === 'gather') return run.control[u.goal]! <= -flip;
  return false;
}

function natureGoal(ctx: Ctx, u: Unit): number {
  const run = ctx.run;
  const map = mapOf(run);
  const nav = navOf(run);
  const here = cellAt(u.x, u.y);
  const hx = Math.floor(u.x / CELL);
  const hy = Math.floor(u.y / CELL);
  const flip = BALANCE.territory.flip;
  const M = BALANCE.march;
  const crowdN = crowd.nature;
  // Don't count itself in the crowd at its current goal.
  if (u.goal >= 0) crowdN[u.goal]!--;

  if (run.flags.length) {
    let flag = run.flags[0]!;
    let fd = Infinity;
    for (const f of run.flags) {
      const d = Math.hypot(f.x - u.x, f.y - u.y);
      if (d < fd) {
        fd = d;
        flag = f;
      }
    }
    const fc = cellAt(flag.x, flag.y);
    const R = BALANCE.flags.radius;
    if (fd > R * CELL) return nav.passable(fc) ? fc : here;
    let best = -1;
    let bestS = Infinity;
    scan(cxOf(fc), cyOf(fc), R, (i, dr) => {
      if (dr > R || !nav.passable(i) || run.control[i]! >= flip) return;
      const s = Math.hypot(cxOf(i) - hx, cyOf(i) - hy) + crowdN[i]! * M.crowd;
      if (s < bestS) {
        bestS = s;
        best = i;
      }
    });
    return best >= 0 ? best : nav.passable(fc) ? fc : here;
  }

  const capital = mainOf(run, 'human');
  const capCell = capital ? capital.cell : map.capital;
  const capField = nav.field(capCell);
  let best = -1;
  let bestS = Infinity;
  scan(hx, hy, M.scan, (i, dr) => {
    if (dr > M.scan || !nav.passable(i)) return;
    if (run.control[i]! >= flip && run.explored[i]) return;
    const toCap = capField[i]!;
    if (toCap >= UNREACHABLE) return;
    let s = dr + M.capitalPull * toCap + crowdN[i]! * M.crowd;
    if (seenAt.has(i)) s -= M.building;
    if (s < bestS) {
      bestS = s;
      best = i;
    }
  });
  if (best >= 0) return best;
  // Everything round here is taken: head on towards the capital.
  return capField[here] !== undefined && capField[here]! < UNREACHABLE ? capCell : here;
}

function gathererGoal(ctx: Ctx, u: Unit): number {
  const run = ctx.run;
  const nav = navOf(run);
  const tree = mainOf(run, 'nature');
  const treeField = tree ? nav.field(tree.cell) : null;
  const hx = Math.floor(u.x / CELL);
  const hy = Math.floor(u.y / CELL);
  const flip = BALANCE.territory.flip;
  const crowdH = crowd.human;
  if (u.goal >= 0) crowdH[u.goal]!--;
  let best = -1;
  let bestS = Infinity;
  scan(hx, hy, 8, (i, dr) => {
    if (dr > 8 || !nav.passable(i) || run.control[i]! <= -flip) return;
    const lean = treeField ? Math.min(60, treeField[i]!) * 0.25 : 0;
    const s = dr + lean + crowdH[i]! * 1.5;
    if (s < bestS) {
      bestS = s;
      best = i;
    }
  });
  if (best >= 0) return best;
  const home = ctx.byId.get(u.home);
  return home && 'cell' in home ? home.cell : cellAt(u.x, u.y);
}

function soldierGoal(ctx: Ctx, u: Unit): number {
  const run = ctx.run;
  let best = -1;
  let bestD = Infinity;
  for (const b of run.buildings) {
    if (b.side !== 'nature' || b.hp <= 0) continue;
    const d = Math.hypot(b.x - u.x, b.y - u.y);
    if (d < bestD) {
      bestD = d;
      best = b.cell;
    }
  }
  return best >= 0 ? best : cellAt(u.x, u.y);
}

/** The point in its goal cell a unit walks to. */
export function goalPoint(u: Unit): [number, number] {
  return [(cxOf(u.goal) + 0.5) * CELL + u.ox, (cyOf(u.goal) + 0.5) * CELL + u.oy];
}
