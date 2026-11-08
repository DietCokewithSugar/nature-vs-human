import { BALANCE } from '../config/balance.ts';
import { BUILDINGS } from '../config/buildings.ts';
import { DISASTERS } from '../config/disasters.ts';
import { UNITS } from '../config/units.ts';
import { ZONES } from '../map/grid.ts';
import type { RunState } from '../state.ts';
import { DISASTER_IDS, type DisasterId } from '../types.ts';
import { destroyBuilding } from './buildings.ts';
import { rand, type Ctx } from './ctx.ts';
import { buildingMaxHp } from './stats.ts';
import { hurtInZone } from './units.ts';

const DZ = BALANCE.disasters;

/** Any disaster but the last one, picked with the run's seed. */
export function rollDisaster(ctx: Ctx): DisasterId {
  const pool = DISASTER_IDS.filter((d) => d !== ctx.run.lastDisaster);
  return pool[Math.floor(rand(ctx) * pool.length)] ?? pool[0]!;
}

export function stepDisaster(ctx: Ctx, dt: number): void {
  const { run } = ctx;
  const d = run.disaster;
  if (!d) {
    if (run.era < DZ.fromEra) return;
    run.nextDisaster -= dt;
    if (run.nextDisaster > 0) return;
    const id = rollDisaster(ctx);
    run.disaster = { id, phase: 'warning', left: DISASTERS[id].warn };
    ctx.emit({ type: 'disasterWarning', id, warn: DISASTERS[id].warn });
    return;
  }
  if (d.phase === 'active') strike(ctx, d.id, dt);
  d.left -= dt;
  if (d.left > 0) return;
  if (d.phase === 'warning') {
    d.phase = 'active';
    d.left = DISASTERS[d.id].duration;
    ctx.refresh();
    ctx.emit({ type: 'disasterStarted', id: d.id });
    return;
  }
  run.disaster = null;
  run.lastDisaster = d.id;
  const [lo, hi] = DZ.gap;
  run.nextDisaster = lo + (hi - lo) * rand(ctx);
  ctx.refresh();
  ctx.emit({ type: 'disasterEnded', id: d.id });
}

/** Everything in the zone takes damage, except the class that rides the disaster and its homes. */
function strike(ctx: Ctx, id: DisasterId, dt: number): void {
  const { run, mods } = ctx;
  const zone = ZONES[DISASTERS[id].zone];
  hurtInZone(ctx, zone.x, zone.z, zone.r, DZ.damage, dt);
  for (const b of [...run.buildings]) {
    if (Math.hypot(b.x - zone.x, b.z - zone.z) > zone.r) continue;
    const def = BUILDINGS[b.kind];
    if (mods.boost && def.spawns.some((s) => UNITS[s.unit].cls === mods.boost!.cls)) continue;
    b.hp -= buildingMaxHp(run, b) * DZ.damage * 0.6 * dt;
    b.hitAt = run.time;
    if (b.hp <= 0) destroyBuilding(ctx, b, null);
  }
}

export function disasterZone(run: RunState) {
  return run.disaster ? ZONES[DISASTERS[run.disaster.id].zone] : null;
}
