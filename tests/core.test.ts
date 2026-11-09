import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  BUILDINGS,
  CELL,
  CELLS,
  ERA_HALF,
  GRID,
  Game,
  PICKS,
  SAVE_VERSION,
  T,
  UNITS,
  canPlace,
  cellOwner,
  counterMult,
  createState,
  famished,
  mealMult,
  predatorsOf,
  trophicOf,
  cxOf,
  cyOf,
  deserialize,
  exportSave,
  generateMap,
  holdable,
  idx,
  importSave,
  landCounts,
  mainOf,
  natureFood,
  openCell,
  ringOf,
  serialize,
  unitMaxHp,
  walkable,
  type CoreEvent,
  type GameState,
  type NatureBuildingId,
  type Unit,
  type UnitId,
} from '../src/core/index.ts';

const SEEDS = [1, 7, 42, 99, 20261108];

function fresh(seed = 42): Game {
  const g = new Game(createState());
  g.startRun(seed);
  return g;
}

function build(g: Game, kind: NatureBuildingId): number {
  g.run.essence += 10_000;
  const cell = g.autoCell(kind);
  expect(cell).not.toBeNull();
  expect(g.build(cell!, kind)).toBe(true);
  return cell!;
}

function finish(g: Game, kind: NatureBuildingId): number {
  const cell = build(g, kind);
  const b = g.run.buildings.find((x) => x.cell === cell)!;
  b.progress = 1;
  b.hp = b.maxHp;
  return cell;
}

/** Keep the humans out of a test: only the capital, never giving birth; no AI. */
function quietHumans(g: Game): void {
  g.run.buildings = g.run.buildings.filter((b) => b.side === 'nature' || b.kind === 'lodge');
  g.run.human.think = 1e9;
  mainOf(g.run, 'human')!.timer = -1e9;
}

function cellsWithin(cx: number, cy: number, r: number): number[] {
  const out: number[] = [];
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (x >= 0 && y >= 0 && x < GRID && y < GRID && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) out.push(idx(x, y));
  return out;
}

describe('the map', () => {
  it('is the same for the same seed and different for another', () => {
    const a = generateMap(5);
    const b = generateMap(5);
    expect(Array.from(a.terrain)).toEqual(Array.from(b.terrain));
    expect(Array.from(a.owner)).toEqual(Array.from(b.owner));
    expect(Array.from(generateMap(6).terrain)).not.toEqual(Array.from(a.terrain));
  });

  it('opens in rings: the ice age is the middle 32 × 32, each era 8 cells more all round', () => {
    expect(ERA_HALF).toEqual([16, 24, 32, 40]);
    expect(ringOf(GRID / 2, GRID / 2)).toBe(0);
    expect(ringOf(24, 24)).toBe(0);
    expect(ringOf(23, 40)).toBe(1);
    expect(ringOf(16, 40)).toBe(1);
    expect(ringOf(15, 40)).toBe(2);
    expect(ringOf(0, 0)).toBe(3);
    let ring0 = 0;
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (ringOf(x, y) === 0) ring0++;
    expect(ring0).toBe(32 * 32);
  });

  it.each(SEEDS)('seed %i: the humans start with 51–53 % of the ice-age land; nature has a few scattered enclaves; the rest is wild', (seed) => {
    const m = generateMap(seed);
    let land = 0;
    let human = 0;
    let nature = 0;
    let wild = 0;
    let neutral = 0;
    for (let i = 0; i < CELLS; i++) {
      if (m.ring[i] !== 0 || !holdable(m.terrain[i]!)) continue;
      land++;
      if (m.owner[i] === -1) human++;
      else if (m.owner[i] === 1) nature++;
      else {
        neutral++;
        const t = m.terrain[i]!;
        if (t === T.forest || t === T.dune || t === T.snow) wild++;
      }
    }
    expect(human / land).toBeGreaterThanOrEqual(0.51);
    expect(human / land).toBeLessThanOrEqual(0.53);
    expect(nature / land).toBeLessThan(0.1);
    // Nobody's land is dense forest and dunes (beaches and streams aside).
    expect(wild / neutral).toBeGreaterThan(0.8);
    // Nature's land is in several separate pieces.
    const seen = new Uint8Array(CELLS);
    let pieces = 0;
    for (let i = 0; i < CELLS; i++) {
      if (m.ring[i] !== 0 || m.owner[i] !== 1 || seen[i]) continue;
      pieces++;
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const c = stack.pop()!;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const x = cxOf(c) + dx!;
          const y = cyOf(c) + dy!;
          if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
          const n = idx(x, y);
          if (!seen[n] && m.owner[n] === 1 && m.ring[n] === 0) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
    expect(pieces).toBeGreaterThanOrEqual(3);
  });

  it.each(SEEDS)('seed %i: both homes have forest, water, sand and a volcano close by; water and volcanoes are nobody’s', (seed) => {
    const m = generateMap(seed);
    for (const home of [m.capital, m.mother]) {
      const near = cellsWithin(cxOf(home) + 1, cyOf(home) + 1, 9).map((i) => m.terrain[i]);
      for (const t of [T.forest, T.water, T.dune, T.volcano]) expect(near).toContain(t);
    }
    for (let i = 0; i < CELLS; i++) if (!holdable(m.terrain[i]!)) expect(m.owner[i]).toBe(0);
  });

  it.each(SEEDS)('seed %i: every walkable cell can be reached from the capital', (seed) => {
    const m = generateMap(seed);
    const seen = new Uint8Array(CELLS);
    const stack = [m.capital];
    seen[m.capital] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const x = cxOf(c) + dx!;
        const y = cyOf(c) + dy!;
        if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
        const n = idx(x, y);
        if (!seen[n] && walkable(m, 3, n)) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    for (let i = 0; i < CELLS; i++) if (holdable(m.terrain[i]!)) expect(seen[i]).toBe(1);
  });
});

describe('a fresh run', () => {
  it('starts with the mother tree in its enclave and the capital in the middle, in the ice age', () => {
    const g = fresh();
    const m = generateMap(g.run.mapSeed);
    expect(g.run.phase).toBe('battle');
    expect(g.run.stage).toBe(1);
    expect(g.run.era).toBe(0);
    expect(mainOf(g.run, 'nature')?.cell).toBe(m.mother);
    expect(mainOf(g.run, 'human')?.cell).toBe(m.capital);
    expect(g.run.buildings.some((b) => b.kind === 'rack')).toBe(true);
    expect(g.run.essence).toBe(BALANCE.nature.start);
    expect(cellOwner(g.run, m.mother)).toBe('nature');
    expect(cellOwner(g.run, m.capital)).toBe('human');
    const land = landCounts(g.run);
    expect(land.human / land.total).toBeGreaterThanOrEqual(0.51);
    expect(land.human / land.total).toBeLessThanOrEqual(0.53);
    // The outer rings are closed.
    const outer = idx(10, 40);
    expect(openCell(g.run, outer)).toBe(false);
    expect(g.run.control[outer]).toBe(0);
  });
});

describe('fog of war', () => {
  it('shows nature its own land and keeps the rest black until something goes there', () => {
    const g = fresh();
    const m = generateMap(g.run.mapSeed);
    expect(g.run.explored[m.mother]).toBe(1);
    expect(g.visible[m.mother]).toBe(1);
    expect(g.run.explored[m.capital]).toBe(0);
    expect(g.visible[m.capital]).toBe(0);
    const lodge = mainOf(g.run, 'human')!;
    expect(lodge.seen).toBe(false);
    // Closed rings are never explored.
    for (let i = 0; i < CELLS; i++) if (m.ring[i]! > 0) expect(g.run.explored[i]).toBe(0);
  });

  it('explores where units go; what they leave stays explored but not visible', () => {
    const g = fresh();
    quietHumans(g);
    finish(g, 'meadow');
    finish(g, 'anthill');
    g.advance(BUILDINGS.anthill.interval! + 0.5);
    const ant = g.run.units.find((u) => u.kind === 'ant')!;
    const lodge = mainOf(g.run, 'human')!;
    g.run.units = [ant];
    ant.x = lodge.x;
    ant.y = lodge.y + 20;
    g.advance(0.2);
    const there = g.run.control.length && Math.floor(ant.y / CELL) * GRID + Math.floor(ant.x / CELL);
    expect(g.run.explored[there]).toBe(1);
    expect(g.visible[there]).toBe(1);
    expect(lodge.seen).toBe(true);
    g.run.units = [];
    g.advance(0.2);
    expect(g.run.explored[there]).toBe(1);
    expect(g.visible[there]).toBe(0);
  });
});

describe('building', () => {
  it('only builds on free ground nature holds, a cell apart, and charges for it', () => {
    const g = fresh();
    const m = generateMap(g.run.mapSeed);
    expect(g.buildCheck(m.capital + GRID * 3, 'anthill').ok).toBe(false);
    const water = Array.from(m.terrain).findIndex((t, i) => t === T.water && m.ring[i] === 0);
    expect(g.buildCheck(water, 'anthill')).toEqual({ ok: false, why: 'cell' });
    // Right next to the mother tree is too close.
    expect(g.buildCheck(m.mother + 2, 'anthill')).toEqual({ ok: false, why: 'taken' });
    const cell = g.autoCell('anthill')!;
    g.run.essence = 10;
    expect(g.buildCheck(cell, 'anthill')).toEqual({ ok: false, why: 'money' });
    g.run.essence = 100;
    expect(g.build(cell, 'anthill')).toBe(true);
    expect(g.run.essence).toBe(100 - BUILDINGS.anthill.cost);
    expect(g.buildCheck(cell, 'anthill').ok).toBe(false);
    expect(g.buildCheck(cell + 1, 'anthill').ok).toBe(false);
    expect(g.buildCost('anthill')).toBeGreaterThan(BUILDINGS.anthill.cost);
    expect(canPlace(g.run, 'nature', 'meadow', cell)).toBe(false);
  });

  it('finishes construction, then sends units out', () => {
    const g = fresh();
    quietHumans(g);
    finish(g, 'meadow');
    const cell = build(g, 'anthill');
    g.advance(BUILDINGS.anthill.buildTime + 0.5);
    expect(g.run.buildings.find((b) => b.cell === cell)!.progress).toBe(1);
    g.advance(BUILDINGS.anthill.interval! + 0.5);
    expect(g.run.units.filter((u) => u.kind === 'ant').length).toBeGreaterThan(0);
  });

  it('refunds half when demolishing', () => {
    const g = fresh();
    g.run.essence = 1000;
    const cell = g.autoCell('den')!;
    g.build(cell, 'den');
    const b = g.run.buildings.find((x) => x.cell === cell)!;
    const before = g.run.essence;
    expect(g.demolish(b.id)).toBe(true);
    expect(g.run.essence).toBeCloseTo(before + Math.floor(BUILDINGS.den.cost / 2), 5);
  });
});

describe('food chain', () => {
  it('holds predators back until herbivores feed them', () => {
    const g = fresh();
    quietHumans(g);
    finish(g, 'den');
    g.advance(BUILDINGS.den.interval! + 1);
    expect(g.run.units.filter((u) => u.kind === 'wolf').length).toBe(0);
    expect(g.run.buildings.find((b) => b.kind === 'den')!.blocked).toBe('meat');
    finish(g, 'meadow');
    finish(g, 'meadow');
    finish(g, 'glade');
    g.advance(40);
    const food = natureFood(g.run, g.mods);
    expect(food.meat.supply).toBeGreaterThan(0);
    expect(g.run.units.some((u) => u.kind === 'wolf')).toBe(true);
    expect(food.meat.demand).toBeLessThanOrEqual(food.meat.supply + 1e-6);
    expect(food.grass.demand).toBeLessThanOrEqual(food.grass.supply + 1e-6);
  });

  it('starves the layer whose food is gone', () => {
    const g = fresh();
    quietHumans(g);
    finish(g, 'meadow');
    finish(g, 'glade');
    g.advance(30);
    expect(g.run.units.filter((u) => u.kind === 'elk').length).toBeGreaterThan(0);
    g.run.buildings = g.run.buildings.filter((b) => b.kind !== 'meadow');
    const events: CoreEvent[] = [];
    g.on((e) => events.push(e));
    g.advance(BALANCE.nature.stockSeconds + 30);
    expect(events.some((e) => e.type === 'starving' && e.diet === 'grass')).toBe(true);
  });
});

describe('predators and prey', () => {
  /** A unit standing still near the mother tree (it won't wander off to a goal). */
  function put(g: Game, kind: UnitId, dx: number, dy = 0): Unit {
    const tree = mainOf(g.run, 'nature')!;
    const maxHp = unitMaxHp(kind, g.run, g.mods);
    const u: Unit = {
      id: g.run.nextId++,
      kind,
      side: UNITS[kind].side,
      x: tree.x + 40 + dx,
      y: tree.y + 24 + dy,
      home: tree.id,
      goal: -1,
      rethink: 1e9,
      ox: 0,
      oy: 0,
      hp: maxHp,
      maxHp,
      target: 0,
      cd: 0,
      look: 0,
      fought: -99,
      hitAt: -99,
      struckAt: -99,
      face: 1,
      hungry: false,
      fedAt: g.run.time,
      fullUntil: 0,
      hunt: 0,
      huntUntil: 0,
    };
    expect(openCell(g.run, Math.floor(u.y / CELL) * GRID + Math.floor(u.x / CELL))).toBe(true);
    g.run.units.push(u);
    return u;
  }

  it('sorts every species into the food chain', () => {
    expect(UNITS.wolf.prey).toEqual(['elk']);
    expect(predatorsOf('elk')).toEqual(['wolf', 'sabertooth']);
    expect(predatorsOf('ant')).toEqual(['bear']);
    expect(predatorsOf('mammoth')).toEqual([]);
    expect(trophicOf('ant')).toBe('provider');
    expect(trophicOf('elk')).toBe('provider');
    expect(trophicOf('mammoth')).toBe('grazer');
    expect(trophicOf('wolf')).toBe('middle');
    expect(trophicOf('sabertooth')).toBe('apex');
    expect(trophicOf('bear')).toBe('apex');
    expect(trophicOf('spearman')).toBeNull();
    // Only nature's own animals are prey.
    for (const id of Object.keys(UNITS) as UnitId[]) for (const p of UNITS[id].prey ?? []) expect(UNITS[p].side).toBe('nature');
  });

  it('a hurt predator eats nearby prey, the wounded first, and heals', () => {
    const g = fresh();
    quietHumans(g);
    finish(g, 'meadow');
    const events: CoreEvent[] = [];
    g.on((e) => events.push(e));
    const wolf = put(g, 'wolf', 0);
    wolf.hp = wolf.maxHp * 0.4;
    wolf.fedAt = g.run.time - BALANCE.hunt.digest - 1;
    const healthy = put(g, 'elk', 24);
    const wounded = put(g, 'elk', -20, 30);
    wounded.hp = wounded.maxHp * 0.3;
    // Enough meat in store that the one deer left can't leave the wolf short.
    g.run.meatStock = BALANCE.nature.minStock;
    g.advance(4);
    expect(g.run.units.includes(wounded)).toBe(false);
    expect(g.run.units.includes(healthy)).toBe(true);
    expect(wolf.hp).toBeGreaterThan(wolf.maxHp * 0.95);
    expect(g.run.time).toBeLessThan(wolf.fullUntil);
    expect(mealMult(g.run, wolf)).toBe(BALANCE.hunt.fullAtk);
    expect(g.run.stats.eaten).toBe(1);
    expect(g.run.stats.losses).toBe(0);
    expect(events.some((e) => e.type === 'eaten' && e.kind === 'wolf' && e.prey === 'elk')).toBe(true);
    expect(events.some((e) => e.type === 'death' && e.id === wounded.id && e.cause === 'eaten')).toBe(true);
    // Fed and whole: it leaves the other deer alone.
    g.advance(5);
    expect(g.run.units.includes(healthy)).toBe(true);
  });

  it('eats on an empty stomach too, but only its own prey: nobody eats mammoths', () => {
    const g = fresh();
    quietHumans(g);
    finish(g, 'meadow');
    finish(g, 'meadow');
    const bear = put(g, 'bear', 0);
    const mammoth = put(g, 'mammoth', 30);
    const elk = put(g, 'elk', -30);
    const ant = put(g, 'ant', 0, 40);
    g.advance(BALANCE.hunt.appetite + 4);
    expect(g.run.units.includes(ant)).toBe(false);
    expect(g.run.units.includes(mammoth)).toBe(true);
    expect(g.run.units.includes(elk)).toBe(true);
    expect(bear.fedAt).toBeGreaterThan(BALANCE.hunt.appetite - 1);
  });

  it('goes hungry with no prey about, weaker and slower, then wastes away', () => {
    const g = fresh();
    quietHumans(g);
    finish(g, 'meadow');
    finish(g, 'meadow');
    const events: CoreEvent[] = [];
    g.on((e) => events.push(e));
    const saber = put(g, 'sabertooth', 0);
    put(g, 'mammoth', 30);
    g.advance(BALANCE.hunt.hungryAfter + 1);
    expect(famished(g.run, saber)).toBe(true);
    expect(saber.hungry).toBe(true);
    expect(mealMult(g.run, saber)).toBe(BALANCE.hunt.hungryAtk);
    expect(events.some((e) => e.type === 'noPrey' && e.kind === 'sabertooth')).toBe(true);
    expect(saber.hp).toBeCloseTo(saber.maxHp, 5);
    g.advance(BALANCE.hunt.starveAfter - BALANCE.hunt.hungryAfter + 10);
    expect(saber.hp).toBeLessThan(saber.maxHp * 0.95);
    // A deer turns up: it eats and is no longer hungry.
    put(g, 'elk', -30);
    g.advance(4);
    expect(saber.hungry).toBe(false);
    expect(g.run.stats.eaten).toBe(1);
  });

  it('a badly hurt predator leaves the fight to eat', () => {
    const g = fresh();
    quietHumans(g);
    const events: CoreEvent[] = [];
    g.on((e) => events.push(e));
    const wolf = put(g, 'wolf', 0);
    wolf.hp = wolf.maxHp * 0.3;
    wolf.fedAt = g.run.time - BALANCE.hunt.digest - 1;
    const foe = put(g, 'spearman', 60);
    foe.rethink = 1e9;
    put(g, 'elk', -26);
    g.advance(1.5);
    const meal = events.find((e) => e.type === 'eaten' && e.id === wolf.id);
    expect(meal?.type === 'eaten' && meal.heal).toBeGreaterThan(wolf.maxHp * 0.6);
  });

  it('humans are never hungry for prey and hit as hard either way', () => {
    const g = fresh();
    quietHumans(g);
    const man = put(g, 'gatherer', 0);
    man.fedAt = -1e6;
    g.advance(1);
    expect(famished(g.run, man)).toBe(false);
    expect(mealMult(g.run, man)).toBe(1);
  });
});

describe('combat', () => {
  it('knows its counters', () => {
    expect(counterMult(UNITS.torch, UNITS.ant.tags)).toBe(2.5);
    expect(counterMult(UNITS.spearman, UNITS.wolf.tags)).toBe(1.75);
    expect(counterMult(UNITS.javelin, UNITS.mammoth.tags)).toBe(1.5);
    expect(counterMult(UNITS.wolf, UNITS.javelin.tags)).toBe(1.5);
    expect(counterMult(UNITS.ant, ['building'])).toBe(2);
    expect(counterMult(UNITS.spearman, UNITS.ant.tags)).toBe(1);
  });

  it('levels make every unit of a species stronger, including those already out', () => {
    const g = fresh();
    quietHumans(g);
    finish(g, 'meadow');
    finish(g, 'anthill');
    g.advance(5);
    const ant = g.run.units.find((u) => u.kind === 'ant')!;
    const before = ant.maxHp;
    g.run.essence = 1e6;
    expect(g.levelUp('ant')).toBe(true);
    expect(ant.maxHp).toBeCloseTo(before * (1 + BALANCE.levelPower), 5);
    expect(unitMaxHp('ant', g.run, g.mods)).toBeCloseTo(ant.maxHp, 5);
  });

  it('never walks into water or a volcano', () => {
    const g = fresh(7);
    g.run.essence = 5000;
    for (const k of ['meadow', 'meadow', 'anthill', 'glade', 'den'] as const) build(g, k);
    for (let t = 0; t < 120; t++) {
      g.advance(1);
      for (const u of g.run.units) expect(openCell(g.run, Math.floor(u.y / CELL) * GRID + Math.floor(u.x / CELL))).toBe(true);
    }
  });
});

describe('territory', () => {
  it('a unit on a cell pushes it over to its side; a cell with a building holds', () => {
    const g = fresh();
    quietHumans(g);
    finish(g, 'meadow');
    finish(g, 'anthill');
    g.advance(BUILDINGS.anthill.interval! + 0.5);
    const ant = g.run.units.find((u) => u.kind === 'ant')!;
    g.run.units = [ant];
    const lodge = mainOf(g.run, 'human')!;
    // A human cell a little way from the capital, with nothing on it.
    const target = idx(cxOf(lodge.cell) - 3, cyOf(lodge.cell) + 4);
    g.run.control[target] = -100;
    g.run.buildings = g.run.buildings.filter((b) => !(b.side === 'human' && b.cell === target));
    const events: CoreEvent[] = [];
    g.on((e) => events.push(e));
    const park = (u: Unit) => {
      u.x = (cxOf(target) + 0.5) * CELL;
      u.y = (cyOf(target) + 0.5) * CELL;
      u.goal = target;
      u.rethink = 99;
      u.target = 0;
    };
    for (let i = 0; i < 40 && cellOwner(g.run, target) !== 'nature'; i++) {
      park(ant);
      g.advance(0.5);
    }
    expect(cellOwner(g.run, target)).toBe('nature');
    expect(events.some((e) => e.type === 'flip' && e.cell === target && e.owner === 'nature')).toBe(true);
    // The capital's own cells can't be pushed past neutral while it stands.
    const cap = lodge.cell;
    for (let i = 0; i < 40; i++) {
      ant.x = (cxOf(cap) + 0.5) * CELL;
      ant.y = (cyOf(cap) + 0.5) * CELL;
      ant.target = 0;
      lodge.hp = lodge.maxHp;
      g.advance(0.5);
    }
    expect(g.run.control[cap]).toBeLessThanOrEqual(BALANCE.territory.holdBuffer);
  });
});

describe('rally flags', () => {
  it('go only on open ground nature has seen, at most three, and pull the army', () => {
    const g = fresh();
    const m = generateMap(g.run.mapSeed);
    const lodge = mainOf(g.run, 'human')!;
    expect(g.placeFlag(lodge.x, lodge.y)).toBe(false);
    const water = Array.from(m.terrain).findIndex((t, i) => t === T.water && g.run.explored[i] === 1);
    if (water >= 0) expect(g.placeFlag((cxOf(water) + 0.5) * CELL, (cyOf(water) + 0.5) * CELL)).toBe(false);
    const seen = Array.from({ length: CELLS }, (_, i) => i).filter((i) => g.run.explored[i] && openCell(g.run, i));
    for (const c of seen.slice(0, 4)) expect(g.placeFlag((cxOf(c) + 0.5) * CELL, (cyOf(c) + 0.5) * CELL)).toBe(true);
    expect(g.run.flags.length).toBe(BALANCE.flags.max);
    g.clearFlags();
    // One flag far from home: the army heads for it.
    quietHumans(g);
    finish(g, 'meadow');
    finish(g, 'anthill');
    // The seen cell furthest from the tree within its own corner (the way there is clear of the capital).
    const fromTree = (c: number) => Math.hypot(cxOf(c) - cxOf(m.mother), cyOf(c) - cyOf(m.mother));
    const far = seen.filter((c) => fromTree(c) <= 8).reduce((a, b) => (fromTree(b) > fromTree(a) ? b : a));
    expect(g.placeFlag((cxOf(far) + 0.5) * CELL, (cyOf(far) + 0.5) * CELL)).toBe(true);
    g.advance(30);
    const ants = g.run.units.filter((u) => u.kind === 'ant');
    expect(ants.length).toBeGreaterThan(0);
    const flag = g.run.flags[0]!;
    const near = ants.filter((u) => Math.hypot(u.x - flag.x, u.y - flag.y) < (BALANCE.flags.radius + 2) * CELL);
    expect(near.length).toBeGreaterThan(0);
  });
});

describe('stages and eras', () => {
  it('goes from a fallen capital to the pick, then opens the next ring of the map', () => {
    const g = fresh();
    const m = generateMap(g.run.mapSeed);
    const events: CoreEvent[] = [];
    g.on((e) => events.push(e));
    const den = finish(g, 'den');
    // Nature takes a cell; it should still be nature's next stage.
    const taken = g.autoCell('meadow')!;
    mainOf(g.run, 'human')!.hp = 0;
    g.advance(BALANCE.stage.pickDelay + 0.5);
    expect(events.some((e) => e.type === 'stageWon')).toBe(true);
    expect(g.run.phase).toBe('pick');
    expect(g.run.offer.length).toBe(3);
    expect(new Set(g.run.offer).size).toBe(3);
    const pick = g.run.offer[0]!;
    expect(g.choosePick(pick)).toBe(true);
    expect(g.run.picks).toEqual([pick]);
    expect(g.run.stage).toBe(2);
    expect(g.run.era).toBe(1);
    expect(events.some((e) => e.type === 'stageStarted' && e.era === 1 && e.opened)).toBe(true);
    expect(g.run.units.length).toBe(0);
    // Nature keeps its home and its ground; the capital is back, tougher.
    expect(g.run.buildings.some((b) => b.cell === den)).toBe(true);
    expect(cellOwner(g.run, taken)).toBe('nature');
    expect(mainOf(g.run, 'human')!.maxHp).toBeCloseTo(BUILDINGS.lodge.hp * BALANCE.human.mainHpGrowth, 5);
    // The new ring is laid out as the map says, and its towns are built.
    for (let i = 0; i < CELLS; i++) if (m.ring[i] === 1) expect(g.run.control[i]).toBe(m.owner[i]! * BALANCE.territory.max);
    expect(openCell(g.run, idx(20, 40)) || !holdable(m.terrain[idx(20, 40)]!)).toBe(true);
    for (const town of m.towns.filter((t) => t.era === 1)) for (const b of town.buildings) expect(g.run.buildings.some((x) => x.cell === b.cell && x.kind === b.kind)).toBe(true);
    // Further stages go up to the modern age and stay there.
    for (let s = 2; s <= 5; s++) {
      mainOf(g.run, 'human')!.hp = 0;
      g.advance(BALANCE.stage.pickDelay + 0.5);
      g.choosePick(g.run.offer[0]!);
    }
    expect(g.run.stage).toBe(6);
    expect(g.run.era).toBe(3);
  });

  it('applies picks', () => {
    const g = fresh();
    const hp = unitMaxHp('ant', g.run, g.mods);
    g.run.picks.push('soldierAnts');
    g.run.essence = 1e6;
    g.levelUp('meadow');
    expect(unitMaxHp('ant', g.run, g.mods)).toBeCloseTo(hp * 1.5, 5);
    expect(PICKS.every((p) => p.name && p.desc)).toBe(true);
  });

  it('ends a run, pays genes, and talents carry into the next', () => {
    const g = fresh();
    g.run.stage = 3;
    g.run.human.supplies = 0;
    mainOf(g.run, 'nature')!.hp = 0;
    g.advance(0.2);
    expect(g.run.phase).toBe('over');
    const r = g.run.result!;
    expect(r.cleared).toBe(2);
    expect(r.genes).toBe(BALANCE.genes.base + 1 + BALANCE.genes.base + 2);
    expect(g.state.meta.genes).toBe(r.genes);
    expect(g.buyTalent('soil')).toBe(true);
    g.startRun(7);
    expect(g.run.stage).toBe(1);
    expect(g.run.era).toBe(0);
    expect(g.run.essence).toBe(BALANCE.nature.start + 80);
    expect(g.state.meta.runs).toBe(1);
  });
});

describe('determinism and saves', () => {
  function play(seed: number): GameState {
    const g = fresh(seed);
    g.run.essence = 2000;
    for (const k of ['meadow', 'meadow', 'anthill', 'glade', 'ancient'] as const) {
      const c = g.autoCell(k);
      if (c !== null) g.build(c, k);
    }
    g.advance(30);
    const c = g.autoCell('den');
    if (c !== null) g.build(c, 'den');
    g.advance(30);
    return g.state;
  }

  it('plays the same with the same seed', () => {
    const a = play(5);
    const b = play(5);
    expect(JSON.stringify(a.run)).toBe(JSON.stringify(b.run));
  });

  it('round-trips through a save and an export string', () => {
    const state = play(9);
    const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
    expect(back.version).toBe(SAVE_VERSION);
    expect(JSON.stringify(back.run)).toBe(JSON.stringify(state.run));
    const imported = importSave(exportSave(state));
    expect(imported.meta).toEqual(state.meta);
    expect(back.run.phase).toBe('battle');
    const g = new Game(back);
    g.advance(5);
    expect(g.run.time).toBeGreaterThan(state.run.time);
  });

  it('fills in what saves from before hunting lack', () => {
    const state = play(3);
    const raw = JSON.parse(JSON.stringify(serialize(state)));
    for (const u of raw.run.units) {
      delete u.fedAt;
      delete u.fullUntil;
      delete u.hunt;
      delete u.huntUntil;
    }
    delete raw.run.stats.eaten;
    const back = deserialize(raw);
    expect(back.run.units.length).toBeGreaterThan(0);
    for (const u of back.run.units) {
      expect(u.fedAt).toBe(state.run.time);
      expect(u.hunt).toBe(0);
    }
    expect(back.run.stats.eaten).toBe(0);
    const g = new Game(back);
    g.advance(5);
    expect(g.run.units.every((u) => Number.isFinite(u.hp))).toBe(true);
  });

  it('starts afresh from an old-version save', () => {
    const s = deserialize({ version: 5, meta: { genes: 50 }, run: null });
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.meta.genes).toBe(0);
    const g = new Game(s);
    expect(g.run.buildings.length).toBeGreaterThan(1);
  });
});
