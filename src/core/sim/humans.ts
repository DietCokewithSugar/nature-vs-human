import { BALANCE } from '../config/balance.ts';
import { BUILDINGS, HUMAN_BUILDINGS, isEffect } from '../config/buildings.ts';
import { countermeasureName } from '../config/humans.ts';
import { TAMEABLE, UNITS } from '../config/units.ts';
import { cellAt } from '../map/grid.ts';
import type { Mods } from '../modifiers.ts';
import type { Countermeasure, RunState } from '../state.ts';
import { CLASS_IDS, type EraId, type HumanBuildingId, type UnitClass, type UnitId } from '../types.ts';
import { bestSite, distanceTo, evolveHumans, hasRoom, kindOpen, placeBuilding, placePresets, upgradeBuilding } from './buildings.ts';
import { rand, type Ctx } from './ctx.ts';
import { buildingCost, owned, unitMaxHp, upgradeCost } from './stats.ts';
import { natureShare } from './territory.ts';
import { HUMAN, NATURE, NEUTRAL, type World } from './world.ts';

const R = BALANCE.research;

// ── Research and eras ───────────────────────────────────────────

/** Research per second: a trickle, plus every lab level and every scholar alive. */
export function researchRate(run: RunState, world: World, mods: Mods): number {
  let labs = 0;
  for (const b of run.buildings) if (b.side === 'human' && b.build >= 1 && BUILDINGS[b.kind].lab) labs += b.level;
  let scholars = 0;
  for (const u of run.units) {
    const role = UNITS[u.kind].role;
    if (u.side === 'human' && (role === 'research' || role === 'capture')) scholars++;
  }
  const share = natureShare(world);
  let pressure = R.pressureFloor + R.pressureWeight * share;
  if (share >= BALANCE.territory.winShare && run.era < 4) pressure *= R.rush;
  const stage = Math.min(3, Math.floor(run.research));
  return ((R.base + R.perLab * labs + R.perScholar * scholars) * pressure * BALANCE.difficulty[run.difficulty].research * mods.researchMult) / R.eraCost[stage]!;
}

export function stepResearch(ctx: Ctx, dt: number): void {
  const { run, world, mods } = ctx;
  const before = run.research;
  run.research = Math.min(4, before + researchRate(run, world, mods) * dt);
  for (let k = 0; k < 4; k++) {
    const at = k + R.countermeasureAt;
    if (before < at && run.research >= at) fireCountermeasure(ctx);
  }
  for (let e = 1; e <= 3; e++) {
    if (before < e && run.research >= e && run.era <= e) advanceEra(ctx, (e + 1) as EraId);
  }
}

/** The humans' next era: the map opens a ring, their buildings modernise, new outposts and lairs appear. */
export function advanceEra(ctx: Ctx, era: EraId): void {
  const { run, world } = ctx;
  if (era <= run.era) return;
  run.era = era;
  world.nav.setEra(era);
  world.paths.clear();
  evolveHumans(ctx);
  placePresets(ctx, era);
  world.countCells(run);
  world.refreshObjectives(run);
  ctx.refresh();
  ctx.emit({ type: 'eraUnlocked', era });
}

/** Nature's strongest class: total attack of the living units in it. */
export function strongestClass(run: RunState): UnitClass {
  const sum: Record<UnitClass, number> = { assassin: 0, swarm: 0, hunter: 0, tank: 0, marine: 0 };
  for (const u of run.units) {
    const def = UNITS[u.kind];
    if (u.side === 'nature' && def.cls) sum[def.cls] += def.atk / def.rate;
  }
  let best: UnitClass = 'assassin';
  for (const c of CLASS_IDS) if (sum[c] > sum[best]) best = c;
  return best;
}

function fireCountermeasure(ctx: Ctx): void {
  const { run } = ctx;
  const cm: Countermeasure = { cls: strongestClass(run), era: run.era, at: run.time };
  run.countermeasures.push(cm);
  ctx.refresh();
  ctx.emit({ type: 'countermeasure', cm, name: countermeasureName(cm.cls, cm.era) });
}

// ── Taming ──────────────────────────────────────────────────────

/** Hunters and capturers wear a tameable species down; at 100% every one of them changes sides. */
export function addTaming(ctx: Ctx, kind: UnitId, amount: number): void {
  const { run, mods } = ctx;
  if (!TAMEABLE.includes(kind as never) || run.defected[kind as never] !== undefined) return;
  const id = kind as (typeof TAMEABLE)[number];
  const next = Math.min(1, (run.taming[id] ?? 0) + amount * mods.domesticationMult);
  run.taming[id] = next;
  if (next >= 1) defect(ctx, id);
}

export function defect(ctx: Ctx, id: (typeof TAMEABLE)[number]): void {
  const { run, world, mods } = ctx;
  const domestic = UNITS[id].tame!;
  let count = 0;
  for (const u of run.units) {
    if (u.kind !== id || !world.units.has(u.id)) continue;
    const share = u.hp / unitMaxHp(run, mods, u.kind);
    world.removeUnit(u);
    u.kind = domestic;
    u.side = 'human';
    u.home = 0;
    u.task = 'idle';
    u.target = -1;
    u.needLeft = 0;
    u.hp = unitMaxHp(run, mods, domestic) * share;
    u.life = Math.max(u.age + 30, UNITS[domestic].life * BALANCE.day * (u.life / Math.max(1, UNITS[id].life * BALANCE.day)));
    world.addUnit(u);
    count++;
  }
  run.defected[id] = count;
  delete run.taming[id];
  ctx.refresh();
  ctx.emit({ type: 'defected', id, count, domestic });
}

// ── The humans' decisions ───────────────────────────────────────

type Want = 'lab' | 'military' | 'reclaim' | 'income' | 'defense';

function wantOf(kind: HumanBuildingId): Want {
  const def = BUILDINGS[kind];
  if (def.lab) return 'lab';
  if (isEffect(def)) return 'defense';
  if (!def.spawns.length) return 'income';
  const roles = def.spawns.filter((s) => !s.if).map((s) => UNITS[s.unit].role);
  if (roles.some((r) => r === 'hunt' || r === 'guard' || r === 'capture' || r === 'ram')) return 'military';
  return def.income ? 'income' : 'reclaim';
}

/**
 * Every few seconds the humans spend: a lab first, soldiers where animals press in,
 * settlers at the edge of the wild, money-makers when things are calm, and upgrades.
 */
export function stepHumanAI(ctx: Ctx, dt: number): void {
  const { run, world, mods } = ctx;
  run.humanThink -= dt;
  if (run.humanThink > 0) return;
  run.humanThink = BALANCE.ai.think * (0.8 + rand(ctx) * 0.4);

  const roomy = hasRoom(run, world, mods, 'human');
  if (!roomy || rand(ctx) < BALANCE.ai.upgradeShare) {
    if (tryUpgrade(ctx) || !roomy) return;
  }

  let labs = 0;
  let military = 0;
  let pressure = 0;
  for (const b of run.buildings) if (b.side === 'human' && BUILDINGS[b.kind].lab) labs++;
  for (const u of run.units) {
    const role = UNITS[u.kind].role;
    if (u.side === 'human' && (role === 'hunt' || role === 'guard' || role === 'capture' || role === 'ram')) military++;
    if (u.side === 'nature' && run.owner[cellAt(u.x, u.z)] === HUMAN) pressure++;
  }
  const weights: Record<Want, number> = {
    lab: labs < 1 + Math.floor(run.era / 2) ? 6 : 0.35,
    military: 1 + Math.min(5, (pressure * 1.5) / (military + 2)),
    reclaim: 2,
    income: 0.9,
    defense: 0.6 + Math.min(2.5, pressure / (military + 4)),
  };
  // Effect buildings in moderation: a few of each kind per era.
  const kinds = HUMAN_BUILDINGS.filter((k) => kindOpen(run, mods, k) && (!isEffect(BUILDINGS[k]) || owned(run, 'human', k) < 1 + run.era));
  const options = kinds.map((k) => ({ k, w: weights[wantOf(k)], cost: buildingCost(run, k) }));
  let total = 0;
  for (const o of options) total += o.w;
  let r = rand(ctx) * total;
  let pick = options[0];
  for (const o of options) {
    r -= o.w;
    if (r <= 0) {
      pick = o;
      break;
    }
  }
  if (!pick || pick.cost > run.humanEssence) return;
  const want = wantOf(pick.k);
  const jitter = () => rand(ctx) * 1.5;
  const site = bestSite(run, world, mods, pick.k, (k, speed) => {
    const toNature = distanceTo(run, k, NATURE, 6);
    const toWild = Math.min(toNature, distanceTo(run, k, NEUTRAL, 6));
    let s = speed < 1 ? 12 : 0;
    if (want === 'lab') s -= toNature * 1.2;
    else if (want === 'military' || want === 'defense') s += toNature * 1.4;
    else if (want === 'reclaim') s += toWild * 1.2;
    return s + jitter();
  });
  if (site < 0) return;
  run.humanEssence -= pick.cost;
  placeBuilding(ctx, pick.k, site);
}

function tryUpgrade(ctx: Ctx): boolean {
  const { run } = ctx;
  const pool = run.buildings.filter((b) => b.side === 'human' && b.build >= 1 && upgradeCost(b) !== null);
  if (!pool.length) return false;
  // Labs and the most battered front first; otherwise any.
  const b = pool[Math.floor(rand(ctx) * pool.length)]!;
  const cost = upgradeCost(b)!;
  // Keep enough back to keep building.
  if (cost * 1.6 > run.humanEssence) return false;
  run.humanEssence -= cost;
  upgradeBuilding(ctx, b);
  return true;
}
