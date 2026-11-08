import { BALANCE } from '../config/balance.ts';
import { BUILDINGS, LEVELS, type BuildingDef } from '../config/buildings.ts';
import { DOMESTICS } from '../config/humans.ts';
import { UNITS } from '../config/units.ts';
import { CELLS, PRESETS, cellAt, isOpen, nearResource, neighbors4 } from '../map/grid.ts';
import type { Mods } from '../modifiers.ts';
import type { Building, RunState } from '../state.ts';
import type { BuildingId, EraId, HumanBuildingId, NatureBuildingId, Side, UnitId } from '../types.ts';
import { rand, type Ctx } from './ctx.ts';
import { birthInterval, buildTime, buildingCap, buildingCount, buildingMaxHp, maxAlive } from './stats.ts';
import { spawnUnit } from './units.ts';
import { HUMAN, NATURE, NEUTRAL, sideCode, type World } from './world.ts';

export type SiteProblem = 'closed' | 'water' | 'volcano' | 'occupied' | 'enemy' | 'need' | 'era' | 'locked';

export type SiteVerdict = { ok: true; speed: number } | { ok: false; why: SiteProblem };

/** Is a building kind open to its side at all (era, skills)? */
export function kindOpen(run: RunState, mods: Mods, kind: BuildingId): boolean {
  const def = BUILDINGS[kind];
  if (def.side === 'nature') {
    if (def.skill) return !!mods.unlocked[kind as NatureBuildingId] && def.era <= run.era;
    return def.era <= run.era && def.spawns.some((s) => run.defected[s.unit as never] === undefined);
  }
  // Humans build the kinds of their own era; older ones evolve.
  return def.era === run.era;
}

/** Build speed on a cell for a side, or why it cannot go there. */
export function siteCheck(run: RunState, world: World, mods: Mods, kind: BuildingId, k: number): SiteVerdict {
  const def = BUILDINGS[kind];
  const c = CELLS[k];
  if (!c || !isOpen(run.era, k)) return { ok: false, why: 'closed' };
  if (def.onWater) {
    // A dam goes across the river, from the builder's own bank.
    if (c.biome !== 'fresh') return { ok: false, why: 'need' };
    if (world.byCell[k]) return { ok: false, why: 'occupied' };
    if (!neighbors4(k).some((n) => run.owner[n] === sideCode(def.side))) return { ok: false, why: 'enemy' };
    return { ok: true, speed: 1 };
  }
  if (c.biome === 'volcano') return { ok: false, why: 'volcano' };
  if (!c.claimable) return { ok: false, why: 'water' };
  if (world.byCell[k]) return { ok: false, why: 'occupied' };
  if (def.near && !nearResource(run.era, k, def.near)) return { ok: false, why: 'need' };
  const own = sideCode(def.side);
  const o = run.owner[k];
  if (o === own) return { ok: true, speed: 1 };
  if (o === NEUTRAL) return { ok: true, speed: BALANCE.build.wild * (def.side === 'nature' ? mods.wildBuild : 1) };
  if (def.side === 'nature' && mods.enemyGround[kind as NatureBuildingId]) return { ok: true, speed: BALANCE.build.enemy };
  return { ok: false, why: 'enemy' };
}

/** Build speed right now, from whoever holds the cell. */
function buildSpeed(run: RunState, mods: Mods, b: Building): number {
  const o = run.owner[b.cell];
  if (o === sideCode(b.side)) return 1;
  if (o === NEUTRAL) return BALANCE.build.wild * (b.side === 'nature' ? mods.wildBuild : 1);
  return BALANCE.build.enemy;
}

export function hasRoom(run: RunState, world: World, mods: Mods, side: Side): boolean {
  return buildingCount(run, side) < buildingCap(world, mods, side);
}

/** Put a building down. `done` places it finished (presets, evolutions). */
export function placeBuilding(ctx: Ctx, kind: BuildingId, k: number, done = false, level = 1): Building {
  const { run, world } = ctx;
  const def = BUILDINGS[kind];
  const c = CELLS[k]!;
  const b: Building = {
    id: run.nextId++,
    kind,
    side: def.side,
    cell: k,
    x: c.x,
    z: c.z,
    hp: 0,
    level,
    build: done ? 1 : 0,
    timer: def.interval > 0 ? def.interval * (0.3 + rand(ctx) * 0.4) : 0,
    hitAt: -99,
  };
  b.hp = buildingMaxHp(run, b);
  run.buildings.push(b);
  world.addBuilding(b);
  if (done && def.blocks) world.refreshDams(run);
  if (def.side === 'nature') run.stats.built++;
  ctx.emit({ type: 'buildingPlaced', id: b.id, kind, side: def.side });
  if (done) ctx.emit({ type: 'buildingDone', id: b.id, kind, side: def.side });
  return b;
}

export function destroyBuilding(ctx: Ctx, b: Building, by: Side | null): void {
  const { run, world } = ctx;
  if (!world.buildings.has(b.id)) return;
  world.removeBuilding(b);
  run.buildings = run.buildings.filter((x) => x.id !== b.id);
  for (const u of run.units) if (u.home === b.id) u.home = 0;
  if (b.side === 'nature') run.stats.wrecked++;
  else run.stats.razed++;
  if (BUILDINGS[b.kind].blocks) world.refreshDams(run);
  // The ground it stood on is up for grabs.
  if (by) run.control[b.cell] = Math.max(-100, Math.min(100, run.control[b.cell]! + (by === 'nature' ? 30 : -30)));
  ctx.emit({ type: 'buildingDestroyed', id: b.id, kind: b.kind, side: b.side, x: b.x, z: b.z });
}

/** The species a building can make right now. */
export function spawnPool(run: RunState, def: BuildingDef): { unit: UnitId; w: number }[] {
  return def.spawns.filter((s) => {
    if (s.if) return run.defected[DOMESTICS[s.if].from] !== undefined;
    return run.defected[s.unit as never] === undefined;
  });
}

function draw(ctx: Ctx, pool: { unit: UnitId; w: number }[]): UnitId {
  let total = 0;
  for (const p of pool) total += p.w;
  let r = rand(ctx) * total;
  for (const p of pool) {
    r -= p.w;
    if (r <= 0) return p.unit;
  }
  return pool[pool.length - 1]!.unit;
}

/** Where a newborn appears: at the door, or in the nearest water for swimmers. */
function birthplace(ctx: Ctx, b: Building, unit: UnitId): [number, number] {
  const nav = UNITS[unit].nav;
  if (nav === 'water' || nav === 'sea') {
    const k = ctx.world.nav.nearest(b.cell, nav, 3);
    if (k >= 0) return [CELLS[k]!.x + (rand(ctx) - 0.5) * 1.5, CELLS[k]!.z + (rand(ctx) - 0.5) * 1.5];
  }
  const a = rand(ctx) * Math.PI * 2;
  const x = b.x + Math.cos(a) * 2.2;
  const z = b.z + Math.sin(a) * 2.2;
  return ctx.world.nav.passable(x, z, nav) ? [x, z] : [b.x, b.z];
}

export function stepBuildings(ctx: Ctx, dt: number): void {
  const { run, world, mods } = ctx;
  const pop = BALANCE.caps;
  for (const b of run.buildings) {
    const def = BUILDINGS[b.kind];
    if (b.build < 1) {
      b.build = Math.min(1, b.build + (dt * buildSpeed(run, mods, b)) / buildTime(b.kind));
      if (b.build >= 1) {
        if (def.blocks) world.refreshDams(run);
        ctx.emit({ type: 'buildingDone', id: b.id, kind: b.kind, side: b.side });
      }
      continue;
    }
    if (def.interval <= 0) continue;
    b.timer -= dt;
    if (b.timer > 0) continue;
    const cap = b.side === 'nature' ? pop.naturePop : pop.humanPop;
    const pool = spawnPool(run, def);
    const collectors = pool.every((p) => UNITS[p.unit].role === 'collect');
    const full = !collectors && world.pop[b.side] >= cap;
    if (!pool.length || (world.homeCount.get(b.id) ?? 0) >= maxAlive(b) || full) {
      b.timer = 2;
      continue;
    }
    let batch: number = LEVELS.batch[b.level - 1]!;
    for (let n = 0; n < batch; n++) {
      if ((world.homeCount.get(b.id) ?? 0) >= maxAlive(b) || (!collectors && world.pop[b.side] >= cap)) break;
      const unit = draw(ctx, pool);
      if (n === 0 && b.side === 'nature' && UNITS[unit].cls === 'swarm') batch += mods.swarmBatch;
      const [x, z] = birthplace(ctx, b, unit);
      spawnUnit(ctx, unit, x, z, b.id);
    }
    b.timer = birthInterval(mods, b);
  }
}

export function upgradeBuilding(ctx: Ctx, b: Building): void {
  const before = buildingMaxHp(ctx.run, b);
  b.level++;
  // A bigger shell, but no repairs: the damage already done stays.
  b.hp += buildingMaxHp(ctx.run, b) - before;
  ctx.emit({ type: 'buildingUpgraded', id: b.id, kind: b.kind, level: b.level });
}

/** A new era: human buildings are rebuilt as the next era's kind, keeping their level and their scars. */
export function evolveHumans(ctx: Ctx): void {
  const { run } = ctx;
  for (const b of run.buildings) {
    if (b.side !== 'human') continue;
    const next = BUILDINGS[b.kind].next;
    if (!next || BUILDINGS[next].era > run.era) continue;
    const share = Math.max(0.05, b.hp / buildingMaxHp(run, b));
    const from = b.kind;
    b.kind = next as HumanBuildingId;
    b.hp = buildingMaxHp(run, b) * share;
    b.build = 1;
    ctx.emit({ type: 'buildingEvolved', id: b.id, from, to: next });
  }
}

/** Buildings that stand on a ring when it opens, where the ground is still free and held as planned. */
export function placePresets(ctx: Ctx, era: EraId): void {
  const { run, world } = ctx;
  for (const p of PRESETS[era]) {
    const def = BUILDINGS[p.kind];
    if (world.byCell[p.cell]) continue;
    const want = def.side === 'nature' ? NATURE : HUMAN;
    if (run.owner[p.cell] !== want) continue;
    placeBuilding(ctx, p.kind, p.cell, true);
  }
}

/** The best free cell for a kind, by a scoring function (lower is better), or -1. */
export function bestSite(run: RunState, world: World, mods: Mods, kind: BuildingId, score: (k: number, speed: number) => number): number {
  let best = -1;
  let bestS = Infinity;
  for (let k = 0; k < CELLS.length; k++) {
    if (!isOpen(run.era, k)) continue;
    const v = siteCheck(run, world, mods, kind, k);
    if (!v.ok) continue;
    const s = score(k, v.speed);
    if (s < bestS) {
      bestS = s;
      best = k;
    }
  }
  return best;
}

/** Distance (in cells, Chebyshev) from a cell to the nearest cell held by a code, up to a limit. */
export function distanceTo(run: RunState, k: number, code: number, limit = 6): number {
  const c = CELLS[k]!;
  for (let r = 0; r <= limit; r++) {
    for (let j = c.j - r; j <= c.j + r; j++) {
      for (let i = c.i - r; i <= c.i + r; i++) {
        if (Math.max(Math.abs(i - c.i), Math.abs(j - c.j)) !== r) continue;
        if (i < 0 || j < 0 || i >= 32 || j >= 32) continue;
        const n = j * 32 + i;
        if (run.owner[n] === code && CELLS[n]!.claimable && isOpen(run.era, n)) return r;
      }
    }
  }
  return limit + 1;
}

export { cellAt };
