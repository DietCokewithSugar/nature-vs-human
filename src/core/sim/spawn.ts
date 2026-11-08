import { BUILDINGS } from '../config/buildings.ts';
import { UNITS } from '../config/units.ts';
import { cellAt } from '../map/grid.ts';
import { addUnit, mainOf, navOf, type Ctx } from './ctx.ts';
import { canFeed, humanFood, natureFood } from './economy.ts';
import { spawnInterval } from './stats.ts';

/** Construction, then births: each spawner waits its interval, then waits for food. */
export function stepBuildings(ctx: Ctx, dt: number): void {
  const run = ctx.run;
  const nav = navOf(run);
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
    // Step out of the door towards the enemy's main building.
    const foe = mainOf(run, b.side === 'nature' ? 'human' : 'nature');
    let x = b.x;
    let y = b.y + 4;
    if (foe) {
      const d = Math.hypot(foe.x - b.x, foe.y - b.y) || 1;
      const nx = b.x + ((foe.x - b.x) / d) * 12;
      const ny = b.y + 4 + ((foe.y - b.y) / d) * 12;
      if (nav.passable(cellAt(nx, ny))) {
        x = nx;
        y = ny;
      }
    }
    addUnit(ctx, kind, b.id, x, y);
    // Births change the food lines for the rest of this step.
    nf = natureFood(run, ctx.mods);
    hf = humanFood(run);
  }
}
