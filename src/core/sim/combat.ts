import { BALANCE } from '../config/balance.ts';
import { BUILDINGS } from '../config/buildings.ts';
import { CHARGE, EXECUTE, PACK, THICK, UNITS, counterMult } from '../config/units.ts';
import { T, cellAt } from '../map/grid.ts';
import type { Nav } from '../map/nav.ts';
import type { Building, Projectile, Unit } from '../state.ts';
import type { BuildingId, ProjectileKind, Side, Tag, UnitId } from '../types.ts';
import { buildingRadius, isUnit, mapOf, navOf, ownerOf, type Ctx } from './ctx.ts';
import { chooseGoal, countCrowd, goalDone, goalPoint } from './march.ts';
import { towerDmg, unitAtk, unitSpeed } from './stats.ts';

type Entity = Unit | Building;

const PROJECTILE_SPEED: Record<ProjectileKind, number> = { spear: 170, javelin: 150, cone: 120, fire: 90 };
/** Gatherers only fight what comes right up to them. */
const GATHERER_AGGRO = 26;
/** Dense forest slows anyone who doesn't hold it. */
const FOREST_SLOW = 0.75;

function radiusOf(e: Entity): number {
  return isUnit(e) ? UNITS[e.kind].r : buildingRadius(e.kind);
}

function tagsOf(e: Entity): readonly Tag[] {
  return isUnit(e) ? UNITS[e.kind].tags : ['building'];
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function findTarget(ctx: Ctx, u: Unit): Entity | null {
  const def = UNITS[u.kind];
  const gatherer = def.special === 'gather';
  const aggro = gatherer ? GATHERER_AGGRO : BALANCE.aggro + (def.range > 20 ? def.range * 0.5 : 0);
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const v of ctx.run.units) {
    if (v.side === u.side || v.hp <= 0) continue;
    const dx = v.x - u.x;
    if (dx > aggro + 16 || dx < -aggro - 16) continue;
    const d = dist(u.x, u.y, v.x, v.y) - UNITS[v.kind].r;
    if (d > aggro || d >= bestD) continue;
    best = v;
    bestD = d;
  }
  if (best || gatherer) return best;
  for (const b of ctx.run.buildings) {
    if (b.side === u.side || b.hp <= 0) continue;
    const d = dist(u.x, u.y, b.x, b.y) - radiusOf(b);
    if (d > aggro || d >= bestD) continue;
    best = b;
    bestD = d;
  }
  return best;
}

/** Step towards a point, round water and volcanoes; never into them. */
function walk(nav: Nav, u: Unit, gx: number, gy: number, step: number): void {
  const [wx, wy] = nav.waypoint(u.x, u.y, gx, gy);
  const dx = wx - u.x;
  const dy = wy - u.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.5) return;
  const k = Math.min(1, step / d);
  const nx = u.x + dx * k;
  const ny = u.y + dy * k;
  if (nav.passableAt(nx, ny)) {
    u.x = nx;
    u.y = ny;
  } else if (nav.passableAt(nx, u.y)) u.x = nx;
  else if (nav.passableAt(u.x, ny)) u.y = ny;
  if (Math.abs(dx) > 0.5) u.face = dx > 0 ? 1 : -1;
}

/** Forest that isn't yours slows you down. */
function terrainSpeed(ctx: Ctx, u: Unit): number {
  const c = cellAt(u.x, u.y);
  if (c < 0 || mapOf(ctx.run).terrain[c] !== T.forest) return 1;
  return ownerOf(ctx.run.control[c]!) === u.side ? 1 : FOREST_SLOW;
}

/** Damage after the attacker's specials against this target. */
function strikeDamage(ctx: Ctx, u: Unit, t: Entity): { dmg: number; crit: boolean } {
  const def = UNITS[u.kind];
  let dmg = unitAtk(u.kind, ctx.run, ctx.mods);
  let crit = false;
  if (def.special === 'charge' && ctx.run.time - u.fought >= BALANCE.quiet) {
    dmg *= CHARGE.mult + ctx.mods.charge;
    crit = true;
  }
  if (def.special === 'pack') {
    let n = 0;
    for (const w of ctx.run.units) if (w !== u && w.kind === u.kind && w.hp > 0 && dist(u.x, u.y, w.x, w.y) <= PACK.radius) n++;
    dmg *= 1 + Math.min(PACK.max * ctx.mods.pack, PACK.per * ctx.mods.pack * n);
  }
  if (def.special === 'execute' && t.hp < t.maxHp * EXECUTE.below) {
    dmg *= EXECUTE.mult;
    crit = true;
  }
  return { dmg, crit };
}

function counterFor(ctx: Ctx, from: UnitId | BuildingId, t: Entity): number {
  if (!(from in UNITS)) return 1;
  const def = UNITS[from as UnitId];
  let m = counterMult(def, tagsOf(t));
  if (from === 'ant' && !isUnit(t)) m += ctx.mods.antBuilding;
  return m;
}

export function applyDamage(ctx: Ctx, t: Entity, dmg: number, ranged: boolean, crit = false): void {
  if (t.hp <= 0) return;
  let d = dmg;
  if (ranged && isUnit(t) && UNITS[t.kind].special === 'thick') d *= THICK.rangedTaken;
  t.hp -= d;
  t.hitAt = ctx.run.time;
  if (isUnit(t)) t.fought = ctx.run.time;
  ctx.emit({ type: 'hit', id: t.id, x: t.x, y: t.y, dmg: d, side: t.side, crit });
}

/** Everything of the other side within `radius` of (x, y), except `skip`. */
function splashTargets(ctx: Ctx, side: Side, x: number, y: number, radius: number, skip: number): Unit[] {
  const out: Unit[] = [];
  for (const v of ctx.run.units) {
    if (v.side === side || v.hp <= 0 || v.id === skip) continue;
    if (dist(x, y, v.x, v.y) <= radius + UNITS[v.kind].r) out.push(v);
  }
  return out;
}

function shoot(ctx: Ctx, side: Side, kind: ProjectileKind, from: UnitId | BuildingId, x: number, y: number, t: Entity, dmg: number, splash: Projectile['splash']): void {
  const p: Projectile = {
    id: ctx.run.nextId++,
    kind,
    side,
    x,
    y,
    x0: x,
    y0: y,
    target: t.id,
    tx: t.x,
    ty: t.y,
    speed: PROJECTILE_SPEED[kind],
    from,
    dmg,
    splash,
  };
  ctx.run.projectiles.push(p);
}

export function stepUnits(ctx: Ctx, dt: number): void {
  const run = ctx.run;
  const nav = navOf(run);
  countCrowd(ctx);
  const rethink = BALANCE.march.rethink;
  for (const u of run.units) {
    if (u.hp <= 0) continue;
    const def = UNITS[u.kind];
    u.cd -= dt;
    u.look -= dt;
    u.rethink -= dt;
    let t = u.target ? ctx.byId.get(u.target) : undefined;
    if (t && t.hp <= 0) t = undefined;
    if (u.look <= 0 || !t) {
      u.look = BALANCE.retarget;
      const keep = t && isUnit(t) && dist(u.x, u.y, t.x, t.y) <= BALANCE.aggro * 1.3;
      if (!keep) t = findTarget(ctx, u) ?? undefined;
    }
    u.target = t ? t.id : 0;
    const speed = unitSpeed(u.kind, ctx.mods) * (u.hungry ? 0.8 : 1) * terrainSpeed(ctx, u);
    if (t) {
      const ranged = def.range > 20;
      const reach = (ranged ? def.range : def.r + def.range) + radiusOf(t);
      const d = dist(u.x, u.y, t.x, t.y);
      if (d > reach) walk(nav, u, t.x, t.y, speed * dt);
      else {
        u.face = t.x >= u.x ? 1 : -1;
        if (u.cd <= 0) {
          u.cd = def.interval;
          const { dmg, crit } = strikeDamage(ctx, u, t);
          u.fought = run.time;
          u.struckAt = run.time;
          if (def.projectile) {
            shoot(ctx, u.side, def.projectile, u.kind, u.x, u.y - 6, t, dmg, def.splash ?? null);
          } else {
            applyDamage(ctx, t, dmg * counterFor(ctx, u.kind, t), false, crit);
            if (def.splash) {
              for (const v of splashTargets(ctx, u.side, t.x, t.y, def.splash.radius, t.id)) {
                applyDamage(ctx, v, dmg * def.splash.share * counterFor(ctx, u.kind, v), false);
              }
            }
          }
        }
      }
      continue;
    }
    // Nothing to fight: on to its goal, choosing a new one now and then.
    if (u.rethink <= 0 || (u.rethink < rethink - 0.4 && goalDone(ctx, u))) {
      u.goal = chooseGoal(ctx, u);
      u.rethink = rethink * (0.8 + ((u.id * 7) % 5) * 0.1);
    }
    if (u.goal < 0) continue;
    const [gx, gy] = goalPoint(u);
    if (dist(u.x, u.y, gx, gy) > 1.5) walk(nav, u, gx, gy, speed * dt);
  }
  separate(ctx, nav);
}

/** Push overlapping units of the same side apart so a crowd reads as a crowd. */
function separate(ctx: Ctx, nav: Nav): void {
  const us = ctx.run.units;
  // Sort by x so only near neighbours are compared.
  const order = us.slice().sort((a, b) => a.x - b.x);
  for (let i = 0; i < order.length; i++) {
    const a = order[i]!;
    if (a.hp <= 0) continue;
    const ra = UNITS[a.kind].r;
    for (let j = i + 1; j < order.length; j++) {
      const b = order[j]!;
      const dx = b.x - a.x;
      if (dx > 30) break;
      if (b.hp <= 0 || b.side !== a.side) continue;
      const min = (ra + UNITS[b.kind].r) * 0.8;
      if (dx > min) continue;
      const dy = b.y - a.y;
      if (dy > min || dy < -min) continue;
      const d = Math.hypot(dx, dy);
      if (d >= min) continue;
      const push = (min - d) * 0.5;
      const nx = d > 0.01 ? dx / d : (a.id + b.id) % 2 ? 1 : -1;
      const ny = d > 0.01 ? dy / d : 0;
      nudge(nav, a, -nx * push, -ny * push);
      nudge(nav, b, nx * push, ny * push);
    }
  }
}

function nudge(nav: Nav, u: Unit, dx: number, dy: number): void {
  if (nav.passableAt(u.x + dx, u.y + dy)) {
    u.x += dx;
    u.y += dy;
  }
}

export function stepTowers(ctx: Ctx, dt: number): void {
  for (const b of ctx.run.buildings) {
    const tower = BUILDINGS[b.kind].tower;
    if (!tower || b.progress < 1 || b.hp <= 0) continue;
    if (b.side === 'human' && ctx.run.wonAt !== null) continue;
    b.shot -= dt;
    if (b.shot > 0) continue;
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const v of ctx.run.units) {
      if (v.side === b.side || v.hp <= 0) continue;
      const d = dist(b.x, b.y, v.x, v.y);
      if (d <= tower.range && d < bestD) {
        best = v;
        bestD = d;
      }
    }
    if (!best) {
      b.shot = 0.2;
      continue;
    }
    b.shot = tower.interval;
    shoot(ctx, b.side, tower.projectile, b.kind, b.x, b.y - 18, best, towerDmg(b.kind, ctx.run, ctx.mods), null);
  }
}

export function stepProjectiles(ctx: Ctx, dt: number): void {
  const run = ctx.run;
  const keep: Projectile[] = [];
  for (const p of run.projectiles) {
    const t = ctx.byId.get(p.target);
    if (t && t.hp > 0) {
      p.tx = t.x;
      p.ty = t.y - (isUnit(t) ? 3 : 8);
    }
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * dt;
    if (d > step + 1) {
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
      keep.push(p);
      continue;
    }
    p.x = p.tx;
    p.y = p.ty;
    ctx.emit({ type: 'impact', kind: p.kind, x: p.x, y: p.y, side: p.side });
    if (t && t.hp > 0) applyDamage(ctx, t, p.dmg * counterFor(ctx, p.from, t), true);
    if (p.splash) {
      for (const v of splashTargets(ctx, p.side, p.x, p.y, p.splash.radius, t ? t.id : 0)) {
        applyDamage(ctx, v, p.dmg * p.splash.share * counterFor(ctx, p.from, v), true);
      }
    }
  }
  run.projectiles = keep;
}
