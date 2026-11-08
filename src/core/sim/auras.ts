import { BUILDINGS } from '../config/buildings.ts';
import { UNITS } from '../config/units.ts';
import type { Unit } from '../state.ts';
import { isNight } from './clock.ts';
import type { Ctx } from './ctx.ts';
import { destroyBuilding } from './buildings.ts';
import { unitMaxHp } from './stats.ts';
import { killUnit } from './units.ts';
import type { UnitFx } from './world.ts';

const scratch: Unit[] = [];

/** Reach of an aura building right now: a little more per level, more at night for fire and lamps. */
export function auraRadius(kind: keyof typeof BUILDINGS, level: number, night: boolean): number {
  const a = BUILDINGS[kind].aura;
  if (!a) return 0;
  return a.radius * (1 + 0.1 * (level - 1)) * (night && a.night ? a.night : 1);
}

/** Is an aura switched on at this time of day? */
export function auraLive(kind: keyof typeof BUILDINGS, night: boolean): boolean {
  const a = BUILDINGS[kind].aura;
  return !!a && (!a.nightOnly || night);
}

/**
 * Effect buildings at work: slows, attack changes and lures are collected per unit for this step;
 * damage, healing and wear on buildings are applied straight away.
 */
export function stepAuras(ctx: Ctx, dt: number): void {
  const { run, world, mods } = ctx;
  world.fx.clear();
  const night = isNight(run.time);
  for (const u of run.units) u.dazed = false;
  for (const b of [...run.buildings]) {
    const def = BUILDINGS[b.kind];
    const a = def.aura;
    if (!a || b.build < 1 || !world.buildings.has(b.id) || !auraLive(b.kind, night)) continue;
    const power = 1 + 0.25 * (b.level - 1);
    const r = auraRadius(b.kind, b.level, night);
    if (a.wear) {
      for (const t of [...run.buildings]) {
        if (t.side !== a.side || Math.hypot(t.x - b.x, t.z - b.z) > r) continue;
        t.hp -= a.wear * power * dt;
        t.hitAt = run.time;
        if (t.hp <= 0) destroyBuilding(ctx, t, b.side);
      }
    }
    if (!a.slow && !a.atk && !a.dps && !a.regen && !a.lure) continue;
    for (const u of world.near(b.x, b.z, r, scratch).slice()) {
      if (u.side !== a.side || !world.units.has(u.id)) continue;
      const udef = UNITS[u.kind];
      // Planes fly over it all.
      if (udef.tags.includes('plane')) continue;
      if (a.tags && !udef.tags.some((t) => a.tags!.includes(t))) continue;
      let fx: UnitFx | undefined = world.fx.get(u.id);
      if (!fx) {
        fx = { slow: 1, atkDown: 1, atkUp: 1, lure: null };
        world.fx.set(u.id, fx);
      }
      if (a.slow) fx.slow = Math.min(fx.slow, a.slow);
      if (a.atk) {
        if (a.atk < 1) fx.atkDown = Math.min(fx.atkDown, a.atk);
        else fx.atkUp = Math.max(fx.atkUp, a.atk);
      }
      if (a.lure && night) {
        fx.lure = { x: b.x, z: b.z };
        u.dazed = true;
      }
      if (a.regen) {
        const max = unitMaxHp(run, mods, u.kind);
        u.hp = Math.min(max, u.hp + max * a.regen * power * dt);
      }
      if (a.dps) {
        u.hp -= a.dps * power * dt;
        u.calm = Math.min(u.calm, 1);
        b.hitAt = run.time;
        if (u.hp <= 0) killUnit(ctx, u, 'trap');
      }
    }
  }
}

/** Attack multiplier auras put on a unit this step. */
export function auraAtk(fx: UnitFx | undefined): number {
  return fx ? fx.atkDown * fx.atkUp : 1;
}
