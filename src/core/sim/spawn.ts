import { BUILDINGS } from '../config/buildings.ts';
import { UNITS } from '../config/units.ts';
import { LANE_Y, PADS, forward } from '../map/layout.ts';
import type { Lane } from '../types.ts';
import { addUnit, type Ctx } from './ctx.ts';
import { canFeed, humanFood, natureFood } from './economy.ts';
import { spawnInterval } from './stats.ts';

/** Construction, then births: each spawner waits its interval, then waits for food. */
export function stepBuildings(ctx: Ctx, dt: number): void {
  const run = ctx.run;
  let nf = natureFood(run, ctx.mods);
  let hf = humanFood(run);
  for (const b of run.buildings) {
    if (b.hp <= 0) continue;
    const def = BUILDINGS[b.kind];
    if (b.progress < 1) {
      const before = b.progress;
      b.progress = Math.min(1, b.progress + dt / Math.max(0.1, def.buildTime));
      // Health rises with the scaffolding.
      b.hp = Math.min(b.maxHp, b.hp + (b.progress - before) * b.maxHp * 0.9);
      if (b.progress >= 1) ctx.emit({ type: 'built', id: b.id, kind: b.kind, side: b.side });
      continue;
    }
    if (!def.makes) continue;
    if (b.side === 'human' && run.wonAt !== null) continue;
    b.timer += dt;
    const interval = spawnInterval(b.kind, ctx.mods);
    if (b.timer < interval) continue;
    const kind = def.makes;
    if (!canFeed(ctx, kind, nf, hf)) {
      b.timer = interval;
      b.blocked = UNITS[kind].diet;
      continue;
    }
    b.blocked = null;
    b.timer = 0;
    let lane: Lane;
    if (b.pad >= 0) lane = PADS[b.pad]!.lane;
    else {
      lane = b.nextLane;
      b.nextLane = ((b.nextLane + 1) % 3) as Lane;
    }
    const fwd = forward(b.side);
    const y = b.pad >= 0 ? b.y + 6 : LANE_Y[lane] === b.y ? b.y + 8 : b.y + (LANE_Y[lane] > b.y ? 20 : -20);
    addUnit(ctx, kind, lane, b.x + fwd * 10, y);
    // Births change the food lines for the rest of this step.
    nf = natureFood(run, ctx.mods);
    hf = humanFood(run);
  }
}
