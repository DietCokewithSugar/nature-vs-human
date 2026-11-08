import { BALANCE } from '../config/balance.ts';
import { BUILDINGS } from '../config/buildings.ts';
import { UNITS } from '../config/units.ts';
import { CELL, CELLS, GRID, cxOf, cyOf, idx } from '../map/grid.ts';
import { footprintCells, mapOf, type Ctx } from './ctx.ts';

/**
 * The fog of war, as in StarCraft: nature sees round its units and buildings, and the ground it
 * holds shows itself and its neighbours. What it has seen once stays explored (terrain and the
 * humans' buildings as last seen); what it has never seen is black. The humans don't use fog.
 */
export function stepVision(ctx: Ctx): void {
  const run = ctx.run;
  const map = mapOf(run);
  const vis = ctx.visible;
  vis.fill(0);
  const disc = (x: number, y: number, r: number) => {
    const cx0 = Math.floor(x / CELL);
    const cy0 = Math.floor(y / CELL);
    const R = Math.ceil(r);
    const r2 = (r + 0.25) * (r + 0.25);
    for (let dy = -R; dy <= R; dy++) {
      const cy = cy0 + dy;
      if (cy < 0 || cy >= GRID) continue;
      for (let dx = -R; dx <= R; dx++) {
        const cx = cx0 + dx;
        if (cx < 0 || cx >= GRID) continue;
        if (dx * dx + dy * dy <= r2) vis[cy * GRID + cx] = 1;
      }
    }
  };
  for (const u of run.units) if (u.side === 'nature' && u.hp > 0) disc(u.x, u.y - 4, UNITS[u.kind].sight);
  const v = BALANCE.vision;
  for (const b of run.buildings) {
    if (b.side !== 'nature') continue;
    const r = BUILDINGS[b.kind].main ? v.main : b.kind === 'ancient' ? v.building + 1.5 : v.building;
    disc(b.x, b.y - CELL / 2, r);
  }
  // Held ground lights itself and its neighbours.
  const flip = BALANCE.territory.flip;
  const control = run.control;
  const g = v.ground;
  for (let i = 0; i < CELLS; i++) {
    if (control[i]! < flip) continue;
    const cx = cxOf(i);
    const cy = cyOf(i);
    for (let dy = -g; dy <= g; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= GRID) continue;
      for (let dx = -g; dx <= g; dx++) {
        const x = cx + dx;
        if (x >= 0 && x < GRID) vis[idx(x, y)] = 1;
      }
    }
  }
  // Only the open map can be seen; seen cells stay explored.
  const explored = run.explored;
  for (let i = 0; i < CELLS; i++) {
    if (!vis[i]) continue;
    if (map.ring[i]! > run.era) {
      vis[i] = 0;
      continue;
    }
    if (!explored[i]) explored[i] = 1;
  }
  for (const b of run.buildings) {
    if (b.seen) continue;
    if (footprintCells(b.kind, b.cell).some((c) => vis[c])) b.seen = true;
  }
}
