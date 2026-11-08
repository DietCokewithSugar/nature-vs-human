import { BALANCE, HOUR } from '../config/balance.ts';
import { BUILDINGS, buildingTags } from '../config/buildings.ts';
import { UNITS, isAnimal, type UnitDef } from '../config/units.ts';
import { CELL, CELLS, NODES, around, cellAt, isOpen } from '../map/grid.ts';
import type { Building, Unit } from '../state.ts';
import type { TargetTag, UnitId } from '../types.ts';
import { auraAtk } from './auras.ts';
import { habitDay, sinceHabit } from './clock.ts';
import { normal, rand, type Ctx } from './ctx.ts';
import type { DeathCause } from './events.ts';
import { destroyBuilding } from './buildings.ts';
import { collectBubble } from './economy.ts';
import { addTaming } from './humans.ts';
import { lifeMult, unitAtk, unitMaxHp } from './stats.ts';
import { workCell } from './territory.ts';
import { HUMAN, NATURE, NEUTRAL, sideCode, type Objective } from './world.ts';

const U = BALANCE.units;
const scratch: Unit[] = [];

const wrap24 = (h: number) => ((h % 24) + 24) % 24;

// ── Birth and death ─────────────────────────────────────────────

export function spawnUnit(ctx: Ctx, kind: UnitId, x: number, z: number, home: number): Unit {
  const { run, mods, world } = ctx;
  const def = UNITS[kind];
  const jitter = 1 + (rand(ctx) * 2 - 1) * U.lifeJitter;
  const u: Unit = {
    id: run.nextId++,
    kind,
    side: def.side,
    x,
    z,
    dir: rand(ctx) * Math.PI * 2,
    hp: unitMaxHp(run, mods, kind),
    age: 0,
    life: def.life * BALANCE.day * lifeMult(mods, def) * jitter,
    home,
    task: 'idle',
    target: -1,
    tx: x,
    tz: z,
    cd: rand(ctx) * def.rate,
    calm: 99,
    think: rand(ctx) * 0.6,
    forageAt: wrap24(normal(ctx, def.forage.at, def.forage.sd)),
    restAt: wrap24(normal(ctx, def.rest.at, def.rest.sd)),
    fedDay: -1,
    restDay: -1,
    needLeft: 0,
    feeding: false,
    hitAt: -99,
    dazed: false,
  };
  // Born mid-habit: today's is done, so a whole litter does not nap at once.
  if (sinceHabit(run.time, u.forageAt) < def.forage.hours && def.role !== 'collect') u.fedDay = habitDay(run.time, u.forageAt);
  if (sinceHabit(run.time, u.restAt) < def.rest.hours) u.restDay = habitDay(run.time, u.restAt);
  run.units.push(u);
  world.addUnit(u);
  ctx.emit({ type: 'unitBorn', id: u.id, kind, side: u.side, home });
  return u;
}

/** Take a unit off the map. The array is compacted at the end of the step. */
export function killUnit(ctx: Ctx, u: Unit, cause: DeathCause, killer?: Unit): void {
  const { run, world } = ctx;
  if (!world.units.has(u.id)) return;
  u.hp = 0;
  world.removeUnit(u);
  if (cause === 'age') {
    if (u.side === 'nature') run.stats.aged++;
  } else if (u.side === 'nature') {
    run.stats.lost++;
    if (cause === 'capture') run.stats.captured++;
  } else if (killer?.side === 'nature' || cause === 'disaster' || cause === 'trap' || cause === 'strike') {
    run.stats.kills++;
  }
  if (killer && killer.side === 'human' && u.side === 'nature' && cause === 'fight') addTaming(ctx, u.kind, BALANCE.domestication.kill);
  if (cause === 'capture') addTaming(ctx, u.kind, BALANCE.domestication.capture);
  ctx.emit({ type: 'unitDied', id: u.id, kind: u.kind, side: u.side, cause, x: u.x, z: u.z });
}

// ── Lookups ─────────────────────────────────────────────────────

function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/** Can this unit fight that one at all? */
function canTarget(u: Unit, def: UnitDef, t: Unit): boolean {
  if (t.side === u.side || t.hp <= 0) return false;
  const tdef = UNITS[t.kind];
  if (tdef.ignored) return false;
  // Planes fly too high for anything but birds.
  if (tdef.tags.includes('plane') && !def.tags.includes('bird')) return false;
  // Land melee cannot follow swimmers out into the water.
  if (def.nav === 'land' && def.range < 3 && tdef.nav !== 'land' && tdef.nav !== 'air') return false;
  return true;
}

/** Is that target a meal for this unit? */
export function isMeal(def: UnitDef, t: UnitId): boolean {
  if (!def.diet) return false;
  const tdef = UNITS[t];
  if (def.diet === 'humans') return tdef.side === 'human' && !isAnimal(t);
  if (def.diet === 'animals') return tdef.side !== def.side && isAnimal(t);
  return false;
}

function buildingIsMeal(def: UnitDef, b: Building): boolean {
  if (!def.diet || b.side === def.side) return false;
  const tags = buildingTags(BUILDINGS[b.kind]);
  if (def.diet === 'wood') return tags.includes('wood');
  if (def.diet === 'fields') return tags.includes('field');
  return false;
}

/**
 * How hard an attacker hits a target: the first of the target's tags (most specific first)
 * the attacker has a multiplier for. A wolf on a hunter uses its 'hunter' number, not 'human'.
 */
export function vsMult(def: UnitDef, tags: readonly TargetTag[]): number {
  if (!def.vs) return 1;
  for (const t of tags) {
    const x = def.vs[t];
    if (x !== undefined) return x;
  }
  return 1;
}

/** The closest enemy in reach, preferring meals and (for capturers) the wounded. */
function findFoe(ctx: Ctx, u: Unit, def: UnitDef, radius: number, mealsOnly = false): Unit | null {
  const near = ctx.world.near(u.x, u.z, radius, scratch);
  let best: Unit | null = null;
  let bestScore = Infinity;
  for (const t of near) {
    if (!canTarget(u, def, t)) continue;
    const meal = isMeal(def, t.kind);
    if (mealsOnly && !meal) continue;
    if ((def.role === 'hunt' || def.role === 'capture' || def.role === 'ram') && !isAnimal(t.kind)) continue;
    let s = dist(u.x, u.z, t.x, t.z);
    if (meal) s *= 0.6;
    if (def.role === 'capture') s *= 0.4 + t.hp / unitMaxHp(ctx.run, ctx.mods, t.kind);
    // Cats go for the small fry.
    if (u.kind === 'cat' && UNITS[t.kind].cls !== 'swarm' && UNITS[t.kind].cls !== 'assassin') s *= 3;
    if (UNITS[t.kind].role === 'collect') s *= 2.5;
    // Birds cannot leave a plane alone.
    if (UNITS[t.kind].tags.includes('plane')) s *= 0.25;
    if (s < bestScore) {
      bestScore = s;
      best = t;
    }
  }
  return best;
}

function homeOf(ctx: Ctx, u: Unit): Building | undefined {
  return u.home ? ctx.world.buildings.get(u.home) : undefined;
}

/** A spot near home to forage: own ground first, wild ground next. */
function forageSpot(ctx: Ctx, u: Unit, def: UnitDef): [number, number] {
  const { run } = ctx;
  const home = homeOf(ctx, u);
  const from = cellAt(home ? home.x : u.x, home ? home.z : u.z);
  const own = sideCode(u.side);
  const mine: number[] = [];
  const wild: number[] = [];
  for (const k of around(from, 3)) {
    const c = CELLS[k]!;
    if (!isOpen(run.era, k) || !ctx.world.nav.cellOk(k, def.nav)) continue;
    if (!c.claimable && def.nav === 'land') continue;
    if (run.owner[k] === own) mine.push(k);
    else if (run.owner[k] === NEUTRAL) wild.push(k);
  }
  // Animals like the wild woods; people stay home.
  const pool = u.side === 'nature' && wild.length && rand(ctx) < 0.45 ? wild : mine.length ? mine : wild;
  if (!pool.length) return [u.x, u.z];
  const k = pool[Math.floor(rand(ctx) * pool.length)]!;
  return [CELLS[k]!.x + (rand(ctx) - 0.5) * CELL * 0.7, CELLS[k]!.z + (rand(ctx) - 0.5) * CELL * 0.7];
}

function restSpot(ctx: Ctx, u: Unit): [number, number] {
  const home = homeOf(ctx, u);
  if (!home) return [u.x, u.z];
  const water = BUILDINGS[home.kind].water && UNITS[u.kind].nav !== 'land';
  if (water) {
    const k = ctx.world.nav.nearest(home.cell, UNITS[u.kind].nav, 3);
    if (k >= 0) return [CELLS[k]!.x + (rand(ctx) - 0.5) * 2, CELLS[k]!.z + (rand(ctx) - 0.5) * 2];
  }
  const a = rand(ctx) * Math.PI * 2;
  return [home.x + Math.cos(a) * 2.6, home.z + Math.sin(a) * 2.6];
}

function wanderSpot(ctx: Ctx, u: Unit, def: UnitDef, radius: number): [number, number] {
  const home = homeOf(ctx, u);
  const cx = home ? home.x : u.x;
  const cz = home ? home.z : u.z;
  for (let i = 0; i < 6; i++) {
    const a = rand(ctx) * Math.PI * 2;
    const r = Math.sqrt(rand(ctx)) * radius;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    const k = cellAt(x, z);
    if (!ctx.world.nav.cellOk(k, def.nav, u.side === 'nature')) continue;
    // People keep to their own streets.
    if (u.side === 'human' && def.nav === 'land' && ctx.run.owner[k] !== HUMAN) continue;
    return [x, z];
  }
  return [u.x, u.z];
}

function pickObjective(ctx: Ctx, u: Unit, def: UnitDef): Objective | null {
  const { run, world } = ctx;
  const list = def.nav === 'water' || def.nav === 'sea' ? world.shore[u.side] : world.objectives[u.side];
  if (!list.length) return null;
  const rally = u.side === 'nature' ? run.rally : null;
  const home = homeOf(ctx, u);
  let best: Objective | null = null;
  let bestScore = Infinity;
  const n = list.length;
  const samples = Math.min(n, 40);
  for (let s = 0; s < samples; s++) {
    const o = n <= 40 ? list[s]! : list[Math.floor(rand(ctx) * n)]!;
    let d = dist(u.x, u.z, o.x, o.z);
    if (rally) d = d * 0.35 + dist(o.x, o.z, rally.x, rally.z);
    if (def.role === 'guard' && home) d += dist(o.x, o.z, home.x, home.z) * 0.8;
    let f = 1 + 0.45 * o.claim;
    if (o.kind === 'building') f *= def.siege >= 1.5 ? 0.55 : def.siege < 0.7 ? 1.7 : 1;
    else {
      const owner = run.owner[o.ref];
      if (owner === NEUTRAL) f *= u.side === 'nature' ? 1.3 : def.role === 'reclaim' ? 0.85 : 2.2;
      if (u.side === 'human' && owner === NATURE && def.role === 'reclaim') f *= 0.9;
    }
    const score = d * f * (0.85 + rand(ctx) * 0.3);
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

// ── Needs ───────────────────────────────────────────────────────

/** A habit came round today and has not been done yet. */
function due(time: number, at: number, hours: number, doneDay: number): boolean {
  if (hours <= 0) return false;
  return sinceHabit(time, at) < Math.min(4, hours + 1) && habitDay(time, at) > doneDay;
}

function startForage(ctx: Ctx, u: Unit, def: UnitDef): void {
  u.task = 'forage';
  u.fedDay = habitDay(ctx.run.time, u.forageAt);
  u.needLeft = def.forage.hours * HOUR;
  u.target = -1;
  ctx.world.release(u.id);
  ctx.world.paths.delete(u.id);
  if (def.diet === 'humans' || def.diet === 'animals') {
    const meal = findFoe(ctx, u, def, def.aggro * 3, true);
    if (meal) {
      u.target = meal.id;
      return;
    }
  }
  [u.tx, u.tz] = forageSpot(ctx, u, def);
}

function startRest(ctx: Ctx, u: Unit, def: UnitDef): void {
  u.task = 'rest';
  u.restDay = habitDay(ctx.run.time, u.restAt);
  u.needLeft = def.rest.hours * HOUR;
  u.target = -1;
  ctx.world.release(u.id);
  ctx.world.paths.delete(u.id);
  [u.tx, u.tz] = restSpot(ctx, u);
}

/** A hit on a meal: the daily forage is done, or at least a good part of it. */
function fed(ctx: Ctx, u: Unit, def: UnitDef): void {
  u.feeding = true;
  u.fedDay = Math.max(u.fedDay, habitDay(ctx.run.time, u.forageAt));
  if (u.task === 'forage') u.needLeft -= def.forage.hours * HOUR * 0.25;
}

// ── Deciding ────────────────────────────────────────────────────

function setTarget(ctx: Ctx, u: Unit, task: Unit['task'], target: number, x: number, z: number): void {
  if (u.task !== task || u.target !== target) ctx.world.paths.delete(u.id);
  u.task = task;
  u.target = target;
  u.tx = x;
  u.tz = z;
}

function goObjective(ctx: Ctx, u: Unit, def: UnitDef): boolean {
  const o = pickObjective(ctx, u, def);
  if (!o) return false;
  ctx.world.claim(u.id, o);
  if (o.kind === 'building') {
    setTarget(ctx, u, 'siege', o.ref, o.x, o.z);
  } else {
    const c = CELLS[o.ref]!;
    setTarget(ctx, u, 'work', o.ref, c.x + (rand(ctx) - 0.5) * CELL * 0.6, c.z + (rand(ctx) - 0.5) * CELL * 0.6);
  }
  return true;
}

function decide(ctx: Ctx, u: Unit, def: UnitDef): void {
  const { run, world } = ctx;
  const time = run.time;

  // Pollinators: collect during their shift, rest outside it.
  if (def.role === 'collect') {
    const working = sinceHabit(time, u.forageAt) < def.forage.hours;
    if (!working) {
      if (u.task !== 'rest') {
        u.task = 'rest';
        u.needLeft = 0;
        [u.tx, u.tz] = restSpot(ctx, u);
        world.paths.delete(u.id);
      }
      return;
    }
    if (u.task === 'collect' && run.bubbles.some((b) => b.id === u.target)) return;
    let best = -1;
    let bestD = 70;
    for (const b of run.bubbles) {
      if (b.claimed && b.claimed !== u.id) continue;
      const n = CELLS[NODES[b.node]!.cell]!;
      const d = dist(u.x, u.z, n.x, n.z);
      if (d < bestD) {
        bestD = d;
        best = b.id;
      }
    }
    if (best >= 0) {
      const b = run.bubbles.find((x) => x.id === best)!;
      b.claimed = u.id;
      const n = CELLS[NODES[b.node]!.cell]!;
      setTarget(ctx, u, 'collect', best, n.x, n.z);
    } else {
      u.task = 'forage';
      [u.tx, u.tz] = wanderSpot(ctx, u, def, 10);
    }
    return;
  }

  const fighting = u.calm < U.combatGrace;
  // Busy with a need: keep at it, but hit back when hit.
  if (u.needLeft > 0 && (u.task === 'forage' || u.task === 'rest')) {
    if (u.calm < 1.5 && def.atk > 0) {
      const foe = findFoe(ctx, u, def, def.range + 4);
      if (foe) {
        // Woken up: the rest is over for today. A forager just turns on whoever bothered it.
        if (u.task === 'rest') {
          u.needLeft = 0;
          setTarget(ctx, u, 'fight', foe.id, foe.x, foe.z);
        } else u.target = foe.id;
        return;
      }
    }
    if (u.task === 'forage' && u.target >= 0 && !world.units.has(u.target)) {
      u.target = -1;
      [u.tx, u.tz] = forageSpot(ctx, u, def);
    }
    return;
  }
  u.needLeft = 0;

  // Daily habits come first unless in the thick of a fight.
  if (!fighting) {
    if (due(time, u.forageAt, def.forage.hours, u.fedDay)) return startForage(ctx, u, def);
    if (due(time, u.restAt, def.rest.hours, u.restDay)) return startRest(ctx, u, def);
  }

  switch (def.role) {
    case 'heal': {
      const near = world.near(u.x, u.z, def.aggro * 2, scratch);
      let best: Unit | null = null;
      let worst = 0.95;
      for (const t of near) {
        if (t.side !== 'nature') continue;
        const f = t.hp / unitMaxHp(run, ctx.mods, t.kind);
        if (f < worst) {
          worst = f;
          best = t;
        }
      }
      if (best) setTarget(ctx, u, 'heal', best.id, best.x, best.z);
      else {
        const [x, z] = wanderSpot(ctx, u, def, 14);
        setTarget(ctx, u, 'move', -1, x, z);
      }
      return;
    }
    case 'livestock': {
      const [x, z] = wanderSpot(ctx, u, def, 8);
      setTarget(ctx, u, 'move', -1, x, z);
      return;
    }
    case 'flyer': {
      const [x, z] = wanderSpot(ctx, u, def, 30);
      setTarget(ctx, u, 'move', -1, x, z);
      return;
    }
    default:
      break;
  }

  const eager = def.role === 'fighter' || def.role === 'hunt' || def.role === 'guard' || def.role === 'capture' || def.role === 'ram';
  if (def.atk > 0 && (eager || fighting)) {
    const radius = eager ? def.aggro : def.range + 4;
    const foe = findFoe(ctx, u, def, radius);
    if (foe) {
      setTarget(ctx, u, 'fight', foe.id, foe.x, foe.z);
      return;
    }
  }

  switch (def.role) {
    case 'research':
    case 'ram': {
      const [x, z] = wanderSpot(ctx, u, def, def.role === 'ram' ? 22 : 6);
      setTarget(ctx, u, 'move', -1, x, z);
      return;
    }
    default:
      break;
  }
  if (goObjective(ctx, u, def)) return;
  const [x, z] = wanderSpot(ctx, u, def, 10);
  setTarget(ctx, u, 'move', -1, x, z);
}

// ── Acting ──────────────────────────────────────────────────────

/** Walk (swim, fly) towards a point along the nav grid. Returns the distance left. */
function moveTo(ctx: Ctx, u: Unit, def: UnitDef, x: number, z: number, stop: number, dt: number, pace = 1): number {
  const world = ctx.world;
  const left = dist(u.x, u.z, x, z);
  if (left <= stop) return left;
  let path = world.paths.get(u.id);
  const end = path?.[path.length - 1];
  if (!path || !end || dist(end[0], end[1], x, z) > 2.5) {
    path = world.nav.path(u.x, u.z, x, z, def.nav, u.side === 'nature') ?? [];
    world.paths.set(u.id, path);
  }
  let step = def.speed * pace * (world.fx.get(u.id)?.slow ?? 1) * dt;
  while (step > 0 && path.length) {
    const [wx, wz] = path[0]!;
    const d = dist(u.x, u.z, wx, wz);
    const last = path.length === 1;
    const goal = last ? Math.max(0, stop * 0.8) : 0;
    if (d - goal <= step) {
      if (last) {
        const k = d > 1e-6 ? (d - goal) / d : 0;
        u.x += (wx - u.x) * k;
        u.z += (wz - u.z) * k;
        step = 0;
        path.shift();
      } else {
        u.x = wx;
        u.z = wz;
        step -= d;
        path.shift();
      }
    } else {
      u.dir = Math.atan2(wx - u.x, wz - u.z);
      u.x += ((wx - u.x) / d) * step;
      u.z += ((wz - u.z) / d) * step;
      step = 0;
    }
  }
  return dist(u.x, u.z, x, z);
}

function face(u: Unit, x: number, z: number): void {
  if (Math.abs(x - u.x) + Math.abs(z - u.z) > 1e-3) u.dir = Math.atan2(x - u.x, z - u.z);
}

function hitUnit(ctx: Ctx, u: Unit, def: UnitDef, t: Unit): void {
  const { run, mods } = ctx;
  const tdef = UNITS[t.kind];
  // A bird into a plane: the plane comes down, and so does the bird.
  if (tdef.strike && def.tags.some((tag) => tdef.strike!.includes(tag))) {
    ctx.emit({ type: 'strike', bird: u.kind, x: t.x, z: t.z });
    killUnit(ctx, t, 'strike', u);
    killUnit(ctx, u, 'strike', t);
    return;
  }
  const dmg = unitAtk(run, mods, u) * vsMult(def, tdef.tags) * auraAtk(ctx.world.fx.get(u.id));
  t.hp -= dmg;
  t.calm = 0;
  u.calm = 0;
  u.cd = def.rate;
  u.hitAt = run.time;
  u.feeding = false;
  if (isMeal(def, t.kind)) {
    u.hp = Math.min(unitMaxHp(run, mods, u.kind), u.hp + dmg * U.lifesteal);
    fed(ctx, u, def);
  }
  const tmax = unitMaxHp(run, mods, t.kind);
  if (def.role === 'capture' && t.side === 'nature' && t.hp > 0 && t.hp < tmax * 0.35) {
    ctx.emit({ type: 'captured', kind: t.kind });
    killUnit(ctx, t, 'capture', u);
    return;
  }
  if (t.hp <= 0) killUnit(ctx, t, 'fight', u);
  // Some targets hurt to hit: a taxi ramming a rhino comes off worse.
  if (tdef.thorns && def.tags.some((tag) => tdef.thorns!.tags.includes(tag))) {
    u.hp -= unitMaxHp(run, mods, u.kind) * tdef.thorns.share;
    if (u.hp <= 0) killUnit(ctx, u, 'fight', t);
  }
}

function hitBuilding(ctx: Ctx, u: Unit, def: UnitDef, b: Building): void {
  const { run, mods } = ctx;
  const bdef = BUILDINGS[b.kind];
  const dmg = unitAtk(run, mods, u) * def.siege * vsMult(def, buildingTags(bdef)) * auraAtk(ctx.world.fx.get(u.id));
  b.hp -= dmg;
  b.hitAt = run.time;
  u.calm = 0;
  u.cd = def.rate;
  u.hitAt = run.time;
  u.feeding = false;
  if (buildingIsMeal(def, b)) {
    u.hp = Math.min(unitMaxHp(run, mods, u.kind), u.hp + dmg * U.lifesteal * 0.5);
    fed(ctx, u, def);
  }
  if (b.hp <= 0) destroyBuilding(ctx, b, u.side);
  // Glass towers cut the birds that peck at them.
  if (bdef.thorns && def.tags.some((tag) => bdef.thorns!.tags.includes(tag))) {
    u.hp -= unitMaxHp(run, mods, u.kind) * bdef.thorns.share;
    if (u.hp <= 0) killUnit(ctx, u, 'trap');
  }
}

/** Distance at which a unit can strike something with this body size. */
function reach(def: UnitDef, other: number): number {
  return def.range + def.size * 0.5 + other;
}

function act(ctx: Ctx, u: Unit, def: UnitDef, dt: number): void {
  const { run, world, mods } = ctx;
  switch (u.task) {
    case 'fight':
    case 'forage': {
      if (u.task === 'forage' && u.target < 0) {
        const left = moveTo(ctx, u, def, u.tx, u.tz, 0.6, dt);
        if (left <= 1 && u.side === 'nature') {
          const k = cellAt(u.x, u.z);
          if (run.owner[k] === NEUTRAL) workCell(run, 'nature', k, BALANCE.territory.forageClaim, dt);
        }
        return;
      }
      const t = world.units.get(u.target);
      if (!t) {
        u.think = 0;
        if (u.task === 'forage') u.target = -1;
        return;
      }
      const r = reach(def, UNITS[t.kind].size * 0.5);
      const d = dist(u.x, u.z, t.x, t.z);
      if (d > r) {
        // Taxis and hunters run; everyone else hurries a little.
        moveTo(ctx, u, def, t.x, t.z, r * 0.9, dt, def.role === 'ram' ? 1.2 : 1.1);
        if (d > def.aggro * 3.5) u.think = 0;
        return;
      }
      face(u, t.x, t.z);
      if (u.cd <= 0) hitUnit(ctx, u, def, t);
      return;
    }
    case 'siege': {
      const b = world.buildings.get(u.target);
      if (!b) {
        u.think = 0;
        return;
      }
      const r = reach(def, 1.6);
      const d = dist(u.x, u.z, b.x, b.z);
      if (d > r) {
        moveTo(ctx, u, def, b.x, b.z, r * 0.9, dt);
        return;
      }
      face(u, b.x, b.z);
      if (u.cd <= 0) hitBuilding(ctx, u, def, b);
      return;
    }
    case 'work': {
      const k = u.target;
      const c = CELLS[k];
      if (!c || run.owner[k] === sideCode(u.side)) {
        u.think = 0;
        return;
      }
      const b = world.byCell[k];
      if (b && b.side !== u.side) {
        setTarget(ctx, u, 'siege', b.id, b.x, b.z);
        return;
      }
      const swim = def.nav === 'water' || def.nav === 'sea';
      const there = swim ? dist(u.x, u.z, c.x, c.z) <= def.range + CELL * 0.6 : cellAt(u.x, u.z) === k;
      if (!there) {
        const left = moveTo(ctx, u, def, u.tx, u.tz, swim ? def.range : 0.4, dt);
        if (swim && left <= def.range + 0.5 && dist(u.x, u.z, c.x, c.z) > def.range + CELL * 0.6) u.think = Math.min(u.think, 0.3);
        return;
      }
      const T = BALANCE.territory;
      const rate =
        def.convert *
        T.work[u.side] *
        (u.side === 'nature' ? mods.convertMult : T.humanWorkByEra[run.era - 1]! * (run.owner[k] === NATURE ? T.wildResist : 1));
      workCell(run, u.side, k, rate, dt);
      u.hitAt = run.time;
      if (def.diet === 'fields' && run.owner[k] === HUMAN) {
        u.hp = Math.min(unitMaxHp(run, mods, u.kind), u.hp + unitMaxHp(run, mods, u.kind) * 0.02 * dt);
        if (!u.feeding || u.task !== 'work') fed(ctx, u, def);
      } else u.feeding = false;
      return;
    }
    case 'collect': {
      const b = run.bubbles.find((x) => x.id === u.target);
      if (!b) {
        u.think = 0;
        return;
      }
      const left = moveTo(ctx, u, def, u.tx, u.tz, 0.8, dt);
      if (left <= 1.2) {
        collectBubble(ctx, b.id, 'pollinator');
        u.think = 0;
      }
      return;
    }
    case 'heal': {
      const t = world.units.get(u.target);
      if (!t || t.side !== 'nature') {
        u.think = 0;
        return;
      }
      const d = dist(u.x, u.z, t.x, t.z);
      if (d > def.range) {
        moveTo(ctx, u, def, t.x, t.z, def.range * 0.8, dt);
        return;
      }
      face(u, t.x, t.z);
      const max = unitMaxHp(run, mods, t.kind);
      t.hp = Math.min(max, t.hp + (def.heal ?? 0) * dt);
      u.hitAt = run.time;
      if (t.hp >= max * 0.98) u.think = 0;
      return;
    }
    default: {
      moveTo(ctx, u, def, u.tx, u.tz, 0.5, dt, u.task === 'rest' ? 0.8 : 0.7);
      if (u.task === 'move' && dist(u.x, u.z, u.tx, u.tz) < 0.6) u.task = 'idle';
    }
  }
}

// ── The step ────────────────────────────────────────────────────

export function stepUnits(ctx: Ctx, dt: number): void {
  const { run, world, mods } = ctx;
  for (const u of run.units) {
    if (!world.units.has(u.id)) continue;
    const def = UNITS[u.kind];
    u.age += dt;
    if (u.age >= u.life) {
      killUnit(ctx, u, 'age');
      continue;
    }
    u.calm += dt;
    u.cd -= dt;
    u.think -= dt;
    if (u.needLeft > 0) {
      u.needLeft -= dt;
      if (u.needLeft <= 0) {
        u.needLeft = 0;
        u.task = 'idle';
        u.target = -1;
        u.think = 0;
      }
    }
    // Lamps and zappers draw insects and birds in: they drop what they were doing and circle the light.
    const lure = world.fx.get(u.id)?.lure;
    if (lure && u.calm > 1.5 && u.task !== 'rest' && u.think <= 0) {
      const a = rand(ctx) * Math.PI * 2;
      setTarget(ctx, u, 'move', -1, lure.x + Math.cos(a) * 1.8, lure.z + Math.sin(a) * 1.8);
      world.release(u.id);
      u.think = 1.5 + rand(ctx);
    } else if (u.think <= 0) {
      decide(ctx, u, def);
      u.think = 0.7 + rand(ctx) * 0.6;
    }
    act(ctx, u, def, dt);
    // Wounds close out of combat, faster at rest or while eating.
    if (u.calm >= U.regenDelay || u.task === 'rest' || u.task === 'forage') {
      const settled = dist(u.x, u.z, u.tx, u.tz) < 1.5;
      let rate: number = U.regen;
      if (settled && u.task === 'rest') rate = U.restRegen;
      else if (settled && u.task === 'forage') rate = U.forageRegen;
      if (u.calm < U.regenDelay) rate *= 0.5;
      const max = unitMaxHp(run, mods, u.kind);
      if (u.hp < max) u.hp = Math.min(max, u.hp + max * rate * (u.side === 'nature' ? mods.regenMult : 1) * dt);
    }
  }
  separate(ctx);
  if (run.units.length !== world.units.size) run.units = run.units.filter((u) => world.units.has(u.id));
}

/** Nudge overlapping bodies apart so a crowd reads as a crowd. */
function separate(ctx: Ctx): void {
  const { world } = ctx;
  for (const list of world.bucket) {
    const n = list.length;
    if (n < 2) continue;
    for (let a = 0; a < n; a++) {
      const ua = list[a]!;
      const da = UNITS[ua.kind];
      if (da.nav === 'air') continue;
      for (let b = a + 1; b < n; b++) {
        const ub = list[b]!;
        const db = UNITS[ub.kind];
        if (db.nav === 'air') continue;
        const min = (da.size + db.size) * 0.45;
        const dx = ub.x - ua.x;
        const dz = ub.z - ua.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.25;
        const nx = dx / d;
        const nz = dz / d;
        if (world.nav.passable(ua.x - nx * push, ua.z - nz * push, da.nav, ua.side === 'nature')) {
          ua.x -= nx * push;
          ua.z -= nz * push;
        }
        if (world.nav.passable(ub.x + nx * push, ub.z + nz * push, db.nav, ub.side === 'nature')) {
          ub.x += nx * push;
          ub.z += nz * push;
        }
      }
    }
  }
}

/** Units an active disaster hurts: everything in the zone except the class that rides it. */
export function hurtInZone(ctx: Ctx, x: number, z: number, r: number, share: number, dt: number): void {
  const { run, mods, world } = ctx;
  for (const u of world.near(x, z, r, scratch).slice()) {
    if (!world.units.has(u.id)) continue;
    const def = UNITS[u.kind];
    if (mods.boost && def.cls === mods.boost.cls) continue;
    u.hp -= unitMaxHp(run, mods, u.kind) * share * dt;
    if (u.hp <= 0) killUnit(ctx, u, 'disaster');
  }
}

