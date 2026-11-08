import { BALANCE } from '../config/balance.ts';
import { UNITS } from '../config/units.ts';
import { CELLS, cellAt } from '../map/grid.ts';
import { walkable } from '../map/nav.ts';
import { footprintCells, mapOf, ownerOf, type Ctx } from './ctx.ts';

const pushN = new Float32Array(CELLS);
const pushH = new Float32Array(CELLS);
const holdN = new Uint8Array(CELLS);
const holdH = new Uint8Array(CELLS);
const touched: number[] = [];
const mark = new Uint8Array(CELLS);

/**
 * Units standing on a cell push its control towards their side, unless the other side is
 * standing there too. A building pulls its own cell back to its side, and a cell with one
 * side's building can't be pushed past neutral by the other: tear the building down first.
 */
export function stepTerritory(ctx: Ctx, dt: number): void {
  const run = ctx.run;
  const map = mapOf(run);
  const touch = (c: number) => {
    if (!mark[c]) {
      mark[c] = 1;
      touched.push(c);
    }
  };
  for (const u of run.units) {
    if (u.hp <= 0) continue;
    const c = cellAt(u.x, u.y);
    if (!walkable(map, run.era, c)) continue;
    if (u.side === 'nature') pushN[c] = pushN[c]! + UNITS[u.kind].claim;
    else pushH[c] = pushH[c]! + UNITS[u.kind].claim;
    touch(c);
  }
  const pull = BALANCE.territory.buildingPull;
  for (const b of run.buildings) {
    if (b.hp <= 0) continue;
    for (const c of footprintCells(b.kind, b.cell)) {
      if (b.side === 'nature') {
        holdN[c] = 1;
        if (!pushH[c]) pushN[c] = pushN[c]! + pull;
      } else {
        holdH[c] = 1;
        if (!pushN[c]) pushH[c] = pushH[c]! + pull;
      }
      touch(c);
    }
  }
  const { max, holdBuffer } = BALANCE.territory;
  const control = run.control;
  for (const c of touched) {
    const n = pushN[c]!;
    const h = pushH[c]!;
    const before = control[c]!;
    let v = before;
    if (n > 0 && h === 0) v += n * dt;
    else if (h > 0 && n === 0) v -= h * dt;
    v = Math.max(-max, Math.min(max, v));
    if (holdN[c]) v = Math.max(v, -holdBuffer);
    if (holdH[c]) v = Math.min(v, holdBuffer);
    control[c] = v;
    const was = ownerOf(before);
    const now = ownerOf(v);
    if (was !== now) ctx.emit({ type: 'flip', cell: c, owner: now });
    pushN[c] = 0;
    pushH[c] = 0;
    holdN[c] = 0;
    holdH[c] = 0;
    mark[c] = 0;
  }
  touched.length = 0;
}
