import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  BUILDINGS,
  CELLS,
  Game,
  HOUR,
  NODES,
  OPEN_HALF,
  RESOURCE_KINDS,
  SAVE_VERSION,
  SKILLS,
  UNITS,
  createState,
  deserialize,
  exportSave,
  hourOf,
  importSave,
  isOpen,
  nearResource,
  serialize,
  startShares,
  type EraId,
  type GameState,
} from '../src/core/index.ts';

function fresh(seed = 42): Game {
  const g = new Game(createState());
  g.startRun('beasts', 'normal', seed);
  return g;
}

/** Find a cell index by grid coordinates. */
const cell = (i: number, j: number) => j * 32 + i;

describe('map', () => {
  it('gives the humans more than half the ice-age ground and nature a few small pockets', () => {
    const s = startShares(1);
    const total = s.human + s.nature + s.neutral;
    expect(s.human / total).toBeGreaterThan(0.5);
    expect(s.nature / total).toBeLessThan(0.2);
    expect(s.neutral).toBeGreaterThan(0);
  });

  it('keeps the humans at half or more of the land as the map grows', () => {
    for (const era of [2, 3, 4] as EraId[]) {
      const s = startShares(era);
      expect(s.human / (s.human + s.nature + s.neutral)).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('puts forest, water, sand and the volcano within reach of both sides', () => {
    for (const side of ['human', 'nature'] as const) {
      for (const kind of RESOURCE_KINDS) {
        const ok = CELLS.some((c, k) => c.start === side && isOpen(1, k) && nearResource(1, k, kind));
        expect(ok, `${side} near ${kind}`).toBe(true);
      }
    }
  });

  it('opens a ring per era and never lets anyone hold the volcano or the water', () => {
    expect(OPEN_HALF[1]).toBeLessThan(OPEN_HALF[4]);
    expect(CELLS.filter((c) => c.biome === 'volcano').every((c) => !c.claimable)).toBe(true);
    expect(CELLS.filter((c) => c.water).every((c) => !c.claimable)).toBe(true);
  });

  it('starts every resource point on a land cell', () => {
    for (const n of NODES) expect(CELLS[n.cell]!.claimable).toBe(true);
  });
});

describe('territory', () => {
  it('flips a cell only once it is worked past the threshold', () => {
    const g = fresh();
    const k = cell(14, 11); // human ground in the middle of the city
    expect(g.run.owner[k]).toBe(2);
    g.run.control[k] = BALANCE.territory.flip - 1;
    g.run.worked[k] = 0;
    g.advance(0.1);
    expect(g.run.owner[k]).toBe(2);
    g.run.control[k] = BALANCE.territory.flip + 1;
    g.run.worked[k] = 0;
    g.advance(0.1);
    expect(g.run.owner[k]).toBe(1);
  });

  it('cannot take a cell while an enemy building stands on it', () => {
    const g = fresh();
    const tent = g.run.buildings.find((b) => b.kind === 'tent')!;
    g.run.control[tent.cell] = 100;
    g.advance(0.1);
    expect(g.run.owner[tent.cell]).toBe(2);
    expect(g.run.control[tent.cell]).toBeLessThan(BALANCE.territory.flip);
  });

  it('lets held ground drift back to its holder when nobody works it', () => {
    const g = fresh();
    const k = cell(14, 11);
    g.run.control[k] = 0;
    g.run.worked[k] = 99;
    g.advance(5);
    expect(g.run.control[k]).toBeLessThan(0);
  });
});

describe('buildings', () => {
  it('builds fast on own ground, slowly on neutral ground and not at all on enemy ground', () => {
    const g = fresh();
    g.run.essence = 10_000;
    const own = g.placeCheck('anthill', cell(16, 15));
    expect(own.ok && own.speed).toBe(1);
    const wild = g.placeCheck('anthill', cell(12, 6));
    expect(wild.ok && wild.speed).toBe(BALANCE.build.wild);
    const enemy = g.placeCheck('anthill', cell(14, 11));
    expect(enemy.ok).toBe(false);
  });

  it('lets the anthill go under the city once 地下通道 is learnt', () => {
    const g = fresh();
    g.run.essence = 10_000;
    g.run.skills.as_swarm = true;
    g.run.skills.as_tunnel = true;
    g.refreshMods();
    const v = g.placeCheck('anthill', cell(14, 11));
    expect(v.ok && v.speed).toBe(BALANCE.build.enemy);
  });

  it('needs the right resource nearby', () => {
    const g = fresh();
    g.run.essence = 10_000;
    // The park in the city has forest but no volcano.
    expect(g.placeCheck('den', cell(15, 16)).ok).toBe(true);
    const cave = g.placeCheck('cave', cell(15, 16));
    expect(cave.ok).toBe(false);
    if (!cave.ok) expect(cave.why).toBe('need');
  });

  it('caps nature buildings by the ground it holds', () => {
    const g = fresh();
    const cap = g.buildingCap();
    expect(cap).toBe(BALANCE.caps.natureBase + Math.floor(g.world.held.nature / BALANCE.caps.naturePerCells));
  });

  it('produces units on a timer, up to what the level allows, and upgrades three times at most', () => {
    const g = fresh();
    const hill = g.run.buildings.find((b) => b.kind === 'anthill')!;
    let born = 0;
    g.on((e) => e.type === 'unitBorn' && e.home === hill.id && born++);
    g.advance(40);
    expect(born).toBeGreaterThan(0);
    expect(g.alive(hill.id)).toBeLessThanOrEqual(BUILDINGS.anthill.alive);
    g.run.essence = 100_000;
    for (let i = 0; i < 5; i++) g.upgrade(hill.id);
    expect(hill.level).toBe(4);
  });

  it('never repairs: an upgrade adds the extra shell, not the lost HP', () => {
    const g = fresh();
    g.run.essence = 100_000;
    const den = g.run.buildings.find((b) => b.kind === 'den')!;
    den.hp = 10;
    g.upgrade(den.id);
    expect(den.hp).toBeLessThan(g.buildingMaxHp(den) * 0.5);
  });

  it('charges more for each further building of a kind', () => {
    const g = fresh();
    const first = g.buildingCost('den');
    g.run.essence = 10_000;
    g.place('den', g.autoSite('den'));
    expect(g.buildingCost('den')).toBeGreaterThan(first);
  });
});

describe('units', () => {
  it('die when their lifespan runs out', () => {
    const g = fresh();
    g.advance(20);
    const ant = g.run.units.find((u) => u.kind === 'ant')!;
    expect(ant).toBeTruthy();
    ant.age = ant.life - 0.05;
    const died: string[] = [];
    g.on((e) => e.type === 'unitDied' && e.id === ant.id && died.push(e.cause));
    g.advance(0.2);
    expect(died).toEqual(['age']);
  });

  it('have species-specific HP and lifespans: ants short-lived, wolves sturdier, early humans tough, modern humans long-lived', () => {
    expect(UNITS.ant.hp).toBeLessThan(UNITS.wolf.hp);
    expect(UNITS.ant.life).toBeLessThan(UNITS.wolf.life);
    expect(UNITS.gatherer.hp).toBeGreaterThan(UNITS.officeWorker.hp);
    expect(UNITS.gatherer.life).toBeLessThan(UNITS.officeWorker.life);
  });

  it('heal once out of combat', () => {
    const g = fresh();
    g.advance(20);
    const u = g.run.units.find((x) => x.side === 'nature')!;
    const max = g.unitMaxHp(u.kind);
    u.hp = max * 0.3;
    u.calm = 99;
    g.advance(3);
    if (g.world.units.has(u.id)) expect(u.hp).toBeGreaterThan(max * 0.3);
  });

  it('only live longer through the skill tree, and the living benefit too', () => {
    const g = fresh();
    g.advance(20);
    const ant = g.run.units.find((u) => u.kind === 'ant')!;
    const before = ant.life;
    g.run.essence = 100_000;
    g.run.era = 3;
    g.run.skills.as_swarm = true;
    g.run.skills.as_resist = true;
    g.run.skills.ge_spread = true;
    expect(g.buySkill('ge_long')).toBe(true);
    expect(ant.life).toBeCloseTo(before * 1.25, 5);
  });

  it('draw their own habits from a normal distribution around the species habit', () => {
    const g = fresh(7);
    g.run.essence = 100_000;
    for (let i = 0; i < 4; i++) g.place('den', g.autoSite('den'));
    g.advance(200);
    const wolves = g.run.units.filter((u) => u.kind === 'wolf');
    expect(wolves.length).toBeGreaterThan(3);
    const hours = wolves.map((w) => w.forageAt);
    expect(new Set(hours.map((h) => h.toFixed(2))).size).toBeGreaterThan(1);
    // Wolves mostly hunt in the evening and at night.
    const night = hours.filter((h) => h >= 17 || h <= 4).length;
    expect(night / hours.length).toBeGreaterThan(0.6);
  });

  it('count a wolf biting a human as foraging, and it heals', () => {
    const g = fresh(3);
    g.advance(30);
    const wolf = g.run.units.find((u) => u.kind === 'wolf')!;
    const human = g.run.units.find((u) => u.kind === 'gatherer' || u.kind === 'hunter')!;
    expect(wolf && human).toBeTruthy();
    human.x = wolf.x + 1;
    human.z = wolf.z;
    human.hp = 1e5;
    wolf.hp = 10;
    wolf.task = 'fight';
    wolf.target = human.id;
    wolf.cd = 0;
    wolf.think = 5;
    g.advance(0.1);
    expect(wolf.feeding).toBe(true);
    expect(wolf.hp).toBeGreaterThan(10);
    expect(wolf.fedDay).toBeGreaterThanOrEqual(0);
  });
});

describe('day and night', () => {
  it('starts at dawn and turns a day every four minutes', () => {
    const g = fresh();
    expect(hourOf(g.run.time)).toBeCloseTo(BALANCE.startHour, 5);
    g.advance(HOUR * 6);
    expect(hourOf(g.run.time)).toBeCloseTo(12, 3);
    expect(BALANCE.day).toBe(240);
  });
});

describe('自然之元', () => {
  it('wells up only at resource points nature holds, and a tap collects it', () => {
    const g = fresh();
    g.advance(30);
    expect(g.run.bubbles.length).toBeGreaterThan(0);
    for (const b of g.run.bubbles) expect(g.run.owner[NODES[b.node]!.cell]).toBe(1);
    const b = g.run.bubbles[0]!;
    const before = g.run.essence;
    expect(g.collect(b.id)).toBe(b.value);
    expect(g.run.essence).toBeCloseTo(before + b.value, 5);
  });

  it('earns a little for every cell nature holds', () => {
    const g = fresh();
    expect(g.income()).toBeCloseTo(g.world.held.nature * BALANCE.economy.naturePerCell, 5);
  });
});

describe('the humans', () => {
  it('build and research on their own; a new era opens a ring and modernises their buildings', () => {
    const g = fresh();
    const tents = g.run.buildings.filter((b) => b.kind === 'tent').length;
    g.advance(150);
    expect(g.run.buildings.filter((b) => b.side === 'human').length).toBeGreaterThan(9);
    expect(g.run.research).toBeGreaterThan(0);
    const total = g.world.held.total;
    g.run.research = 0.999;
    g.advance(5);
    expect(g.run.era).toBe(2);
    expect(g.world.held.total).toBeGreaterThan(total);
    expect(g.run.buildings.some((b) => b.kind === 'tent')).toBe(false);
    expect(g.run.buildings.filter((b) => b.kind === 'townhouse').length).toBeGreaterThanOrEqual(tents);
  });

  it('turn wolves into dogs once the taming meter fills, and the dens fall silent', () => {
    const g = fresh();
    g.advance(40);
    const wolves = g.run.units.filter((u) => u.kind === 'wolf').length;
    expect(wolves).toBeGreaterThan(0);
    const events: string[] = [];
    g.on((e) => e.type === 'defected' && events.push(e.id));
    g.tame('wolf', 1);
    expect(events).toEqual(['wolf']);
    expect(g.run.units.filter((u) => u.kind === 'wolf').length).toBe(0);
    expect(g.run.units.filter((u) => u.kind === 'dog' && u.side === 'human').length).toBe(wolves);
    expect(g.kindOpen('den')).toBe(false);
  });
});

describe('winning and losing', () => {
  it('loses when the research completes', () => {
    const g = fresh();
    g.run.era = 4;
    g.run.research = 3.9999;
    g.advance(5);
    expect(g.run.result?.won).toBe(false);
  });

  it('loses when every nature building is gone', () => {
    const g = fresh();
    for (const b of [...g.run.buildings]) if (b.side === 'nature') {
      g.world.removeBuilding(b);
      g.run.buildings = g.run.buildings.filter((x) => x !== b);
    }
    g.advance(0.2);
    expect(g.run.result?.won).toBe(false);
  });

  it('wins in the modern era with the ground held', () => {
    const g = fresh();
    g.run.era = 4;
    g.run.research = 3.5;
    g.world.nav.setEra(4);
    for (let k = 0; k < CELLS.length; k++) {
      if (!CELLS[k]!.claimable || g.world.byCell[k]?.side === 'human') continue;
      g.run.owner[k] = 1;
      g.run.control[k] = 100;
    }
    g.world.countCells(g.run);
    g.advance(0.2);
    expect(g.run.result?.won).toBe(true);
    expect(g.meta.wins.normal).toBe(1);
  });

  it('does not win early: past the win share before the modern era, the humans rush their research', () => {
    const g = fresh();
    const slow = g.researchRate();
    for (let k = 0; k < CELLS.length; k++) {
      if (!CELLS[k]!.claimable || g.world.byCell[k]) continue;
      g.run.owner[k] = 1;
      g.run.control[k] = 100;
    }
    g.world.countCells(g.run);
    g.advance(0.2);
    expect(g.run.result).toBe(null);
    expect(g.researchRate()).toBeGreaterThan(slow * BALANCE.research.rush);
  });
});

describe('skills', () => {
  it('only ask for things that exist', () => {
    const ids = new Set(SKILLS.map((s) => s.id));
    for (const s of SKILLS) for (const r of s.req) if (r.type === 'skill') expect(ids.has(r.id)).toBe(true);
  });
});

describe('saves', () => {
  it('round-trip a run with its units, buildings and ground', () => {
    const g = fresh();
    g.advance(60);
    const data = JSON.parse(JSON.stringify(serialize(g.state)));
    const back = deserialize(data);
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.run.units.length).toBe(g.run.units.length);
    expect(back.run.buildings.length).toBe(g.run.buildings.length);
    expect(back.run.control).toEqual(g.run.control.map((v) => Math.max(-100, Math.min(100, v))));
    const g2 = new Game(back);
    g2.advance(10);
    expect(g2.running).toBe(true);
  });

  it('import what export makes', () => {
    const g = fresh();
    g.advance(10);
    const s = importSave(exportSave(g.state));
    expect(s.run.essence).toBeCloseTo(g.run.essence, 5);
  });

  it('carries meta progress over from the old version and starts a fresh run', () => {
    const old = {
      version: 3,
      meta: { points: 50, spent: 10, levels: { perk_quiet: 2 }, wins: { normal: 1 }, fastest: { normal: 2000 }, lifetime: '1e30', runs: 4, playTime: 9000 },
      run: { route: 'beasts', money: '1e12', creatures: {} },
    };
    const s: GameState = deserialize(old);
    expect(s.meta.points).toBe(50);
    expect(s.meta.levels.perk_quiet).toBe(2);
    expect(s.meta.wins.normal).toBe(1);
    expect(s.meta.fastest.normal).toBe(null);
    const g = new Game(s);
    expect(g.run.buildings.length).toBeGreaterThan(0);
  });

  it('play the same with the same seed', () => {
    const a = fresh(99);
    const b = fresh(99);
    a.advance(90);
    b.advance(90);
    expect(a.run.units.length).toBe(b.run.units.length);
    expect(a.run.control).toEqual(b.run.control);
  });
});

// ── Effect buildings and matchups ───────────────────────────────

import { placeBuilding } from '../src/core/sim/buildings.ts';
import type { Ctx } from '../src/core/sim/ctx.ts';
import { buildingTags, vsMult, type BuildingId, type UnitId } from '../src/core/index.ts';

const ctxOf = (g: Game) => (g as unknown as { ctx: Ctx }).ctx;

/** Turn an existing unit into another kind on a side, at a spot, ready to strike. */
function recruit(g: Game, kind: UnitId, side: 'nature' | 'human', x: number, z: number) {
  const u = g.run.units.find((v) => v.side === side && v.kind !== kind && !g.run.units.some((w) => w === v && w.kind === 'plane'))!;
  g.world.removeUnit(u);
  u.kind = kind;
  u.side = side;
  u.x = x;
  u.z = z;
  u.hp = g.unitMaxHp(kind);
  u.age = 0;
  u.life = 1e6;
  u.home = 0;
  g.world.addUnit(u);
  return u;
}

describe('matchups', () => {
  it('make ants deadly to wood and feeble against people', () => {
    expect(vsMult(UNITS.ant, buildingTags(BUILDINGS.tent))).toBe(3);
    expect(vsMult(UNITS.ant, buildingTags(BUILDINGS.dugout))).toBe(1);
    expect(vsMult(UNITS.ant, UNITS.gatherer.tags)).toBeLessThan(0.5);
    expect(vsMult(UNITS.termite, buildingTags(BUILDINGS.farmhouse))).toBe(4);
  });

  it('make wolves good against people but poor against hunters', () => {
    expect(vsMult(UNITS.wolf, UNITS.gatherer.tags)).toBeGreaterThan(1.5);
    expect(vsMult(UNITS.wolf, UNITS.hunter.tags)).toBeLessThan(0.6);
    expect(vsMult(UNITS.hunter, UNITS.wolf.tags)).toBeGreaterThan(1);
    expect(vsMult(UNITS.hunter, UNITS.ant.tags)).toBeLessThan(0.5);
  });

  it('cut birds that peck at glass towers', () => {
    const g = fresh();
    g.advance(20);
    const tower = g.run.buildings.find((b) => b.side === 'human')!;
    tower.kind = 'tower';
    const bird = recruit(g, 'pigeon', 'nature', tower.x + 1, tower.z);
    bird.task = 'siege';
    bird.target = tower.id;
    bird.cd = 0;
    bird.think = 5;
    const max = g.unitMaxHp('pigeon');
    g.advance(0.1);
    expect(bird.hp).toBeLessThanOrEqual(max * 0.71);
  });

  it('bring a plane down when a bird flies into it, and the bird with it', () => {
    const g = fresh();
    g.advance(30);
    const plane = recruit(g, 'plane', 'human', 0, 0);
    const bird = recruit(g, 'crow', 'nature', 0.8, 0);
    bird.task = 'fight';
    bird.target = plane.id;
    bird.cd = 0;
    bird.think = 5;
    const strikes: string[] = [];
    g.on((e) => e.type === 'strike' && strikes.push(e.bird));
    g.advance(0.1);
    expect(strikes).toEqual(['crow']);
    expect(g.world.units.has(plane.id)).toBe(false);
    expect(g.world.units.has(bird.id)).toBe(false);
  });

  it('let nothing but birds go after planes', () => {
    const g = fresh();
    g.advance(30);
    const plane = recruit(g, 'plane', 'human', 0, 0);
    const wolf = recruit(g, 'wolf', 'nature', 1, 0);
    wolf.think = 0;
    g.advance(1.5);
    expect(g.world.units.has(plane.id)).toBe(true);
    expect(plane.hp).toBe(g.unitMaxHp('plane'));
  });
});

describe('effect buildings', () => {
  function put(g: Game, kind: BuildingId, cell: number) {
    return placeBuilding(ctxOf(g), kind, cell, true);
  }

  it('dam the river against wild swimmers but let the humans boats through', () => {
    const g = fresh();
    g.run.era = 2;
    g.world.nav.setEra(2);
    const k = cell(13, 12);
    expect(g.world.nav.cellOk(k, 'water', true)).toBe(true);
    put(g, 'dam', k);
    expect(g.world.nav.cellOk(k, 'water', true)).toBe(false);
    expect(g.world.nav.cellOk(k, 'water', false)).toBe(true);
  });

  it('only go across a river touching the builder s own ground', () => {
    const g = fresh();
    g.run.era = 2;
    g.refreshMods();
    const ctx = ctxOf(g);
    expect(BUILDINGS.dam.onWater).toBe(true);
    // A river cell in the city, and a land cell.
    const sites = [cell(13, 12), cell(14, 11)].map((k) => (siteOf(ctx, 'dam', k)));
    expect(sites[0]).toBe(true);
    expect(sites[1]).toBe(false);
  });

  it('zap insects that come near, and lamps lure only after dark', () => {
    const g = fresh();
    g.advance(10);
    const k = cell(16, 13);
    const zap = put(g, 'zapper', k);
    const ant = recruit(g, 'ant', 'nature', zap.x + 1, zap.z);
    ant.think = 5;
    const before = ant.hp;
    g.advance(0.5);
    expect(ant.hp).toBeLessThan(before);
    // Morning: a lamp does nothing.
    const lamp = put(g, 'lamp', cell(15, 13));
    const fly = recruit(g, 'mosquito', 'nature', lamp.x + 1, lamp.z);
    g.advance(0.2);
    expect(fly.dazed).toBe(false);
  });

  it('let a campfire take the bite out of animals near it', () => {
    const g = fresh();
    g.advance(10);
    const fire = put(g, 'campfire', cell(16, 13));
    const wolf = recruit(g, 'wolf', 'nature', fire.x + 1, fire.z);
    wolf.think = 5;
    g.advance(0.1);
    const fx = g.world.fx.get(wolf.id);
    expect(fx?.atkDown).toBeLessThan(1);
  });
});

import { siteCheck } from '../src/core/sim/buildings.ts';
function siteOf(ctx: Ctx, kind: BuildingId, k: number): boolean {
  return siteCheck(ctx.run, ctx.world, ctx.mods, kind, k).ok;
}

// ── Lifespan ────────────────────────────────────────────────────

import { spawnUnit } from '../src/core/sim/units.ts';

describe('lifespan', () => {
  it('ends every kind of unit, human and animal alike, when it runs out', () => {
    const g = fresh(5);
    const ctx = ctxOf(g);
    const kinds = Object.keys(UNITS) as UnitId[];
    const spot = (kind: UnitId): [number, number] => {
      const nav = UNITS[kind].nav;
      const c = nav === 'sea' ? CELLS[cell(4, 22)]! : nav === 'water' ? CELLS[cell(13, 10)]! : CELLS[cell(16, 11)]!;
      return [c.x, c.z];
    };
    const units = kinds.map((kind) => {
      const [x, z] = spot(kind);
      const u = spawnUnit(ctx, kind, x, z, 0);
      // Nothing else may kill it first.
      u.hp = 1e9;
      u.age = u.life - 0.05;
      return u;
    });
    const aged = new Map<number, string>();
    g.on((e) => e.type === 'unitDied' && aged.set(e.id, e.cause));
    g.advance(0.2);
    for (const u of units) {
      expect(aged.get(u.id), u.kind).toBe('age');
      expect(g.world.units.has(u.id)).toBe(false);
    }
    expect(units.map((u) => u.side)).toContain('human');
    expect(units.map((u) => u.side)).toContain('nature');
  });

  it('keeps every unit alive until then, with the white bar running down', () => {
    const g = fresh(6);
    const ctx = ctxOf(g);
    const c = CELLS[cell(16, 11)]!;
    const worker = spawnUnit(ctx, 'officeWorker', c.x, c.z, 0);
    worker.hp = 1e9;
    worker.age = worker.life - 1;
    g.advance(0.5);
    expect(g.world.units.has(worker.id)).toBe(true);
    expect(1 - worker.age / worker.life).toBeGreaterThan(0);
    g.advance(0.6);
    expect(g.world.units.has(worker.id)).toBe(false);
  });

  it('gives each species its own natural span, from day-long locusts to long-lived modern people', () => {
    expect(UNITS.locust.life).toBeLessThan(UNITS.ant.life);
    expect(UNITS.ant.life).toBeLessThan(UNITS.wolf.life);
    expect(UNITS.wolf.life).toBeLessThan(UNITS.elephant.life);
    expect(UNITS.gatherer.life).toBeLessThan(UNITS.worker.life);
    expect(UNITS.worker.life).toBeLessThan(UNITS.officeWorker.life);
  });
});

describe('the humans report', () => {
  it('adds its income sources up to what the humans actually earn', () => {
    const g = fresh(8);
    g.advance(60);
    const h = g.humanReport();
    const parts = h.income;
    expect(parts.total).toBeCloseTo(g.humanIncome(), 6);
    expect(parts.total).toBeCloseTo((parts.base + parts.land + parts.nodes + parts.buildings + parts.animals) * parts.panic * parts.difficulty, 6);
    expect(h.essence).toBe(g.run.humanEssence);
    expect(h.research.rate).toBeCloseTo(g.researchRate(), 10);
    expect(h.research.eta).toBeGreaterThan(0);
  });
});
