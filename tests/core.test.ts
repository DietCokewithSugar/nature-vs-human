import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  BUILDINGS,
  Game,
  MAINS,
  PADS,
  PICKS,
  SAVE_VERSION,
  SEGMENTS,
  UNITS,
  counterMult,
  createState,
  deserialize,
  exportSave,
  importSave,
  laneAt,
  mainOf,
  natureFood,
  padUser,
  segOwner,
  segmentAt,
  serialize,
  unitMaxHp,
  type CoreEvent,
  type GameState,
  type NatureBuildingId,
} from '../src/core/index.ts';

function fresh(seed = 42): Game {
  const g = new Game(createState());
  g.startRun(seed);
  return g;
}

/** A nature home pad on a lane. */
function homePad(g: Game, lane: number): number {
  const p = PADS.find((p) => p.home === 'nature' && p.lane === lane && !g.run.buildings.some((b) => b.pad === p.id));
  return p!.id;
}

function finish(g: Game, kind: NatureBuildingId, pad: number): void {
  g.run.essence += 10_000;
  expect(g.build(pad, kind)).toBe(true);
  const b = g.run.buildings.find((x) => x.pad === pad)!;
  b.progress = 1;
  b.hp = b.maxHp;
}

/** Keep the humans out of a test: no lodge births, no AI. */
function quietHumans(g: Game): void {
  for (const b of g.run.buildings) if (b.side === 'human' && b.pad >= 0) b.hp = 0;
  g.run.buildings = g.run.buildings.filter((b) => b.hp > 0);
  g.run.human.think = 1e9;
  const lodge = mainOf(g.run, 'human')!;
  lodge.timer = -1e9;
}

describe('map', () => {
  it('has three lanes of seven stretches and mirrored home pads', () => {
    expect(SEGMENTS).toBe(7);
    expect(laneAt(60)).toBe(0);
    expect(laneAt(160)).toBe(1);
    expect(laneAt(260)).toBe(2);
    expect(laneAt(110)).toBe(-1);
    expect(segmentAt(100)).toBe(-1);
    expect(segmentAt(121)).toBe(0);
    expect(segmentAt(455)).toBe(6);
    const nature = PADS.filter((p) => p.home === 'nature');
    const human = PADS.filter((p) => p.home === 'human');
    expect(nature.length).toBe(human.length);
    for (const p of nature) expect(human.some((q) => q.lane === p.lane && q.y === p.y && q.x === 576 - p.x)).toBe(true);
    expect(PADS.filter((p) => !p.home).length).toBe(12);
    expect(MAINS.nature.x).toBeLessThan(120);
  });
});

describe('a fresh run', () => {
  it('starts with the mother tree, the lodge and the humans’ opening', () => {
    const g = fresh();
    expect(g.run.phase).toBe('battle');
    expect(g.run.stage).toBe(1);
    expect(mainOf(g.run, 'nature')?.kind).toBe('mothertree');
    expect(mainOf(g.run, 'human')?.kind).toBe('lodge');
    expect(g.run.buildings.some((b) => b.kind === 'rack')).toBe(true);
    expect(g.run.essence).toBe(BALANCE.nature.start);
    // Home stretches start owned, the middle neutral.
    expect(segOwner(g.run, 1, 0)).toBe('nature');
    expect(segOwner(g.run, 1, 3)).toBe('neutral');
    expect(segOwner(g.run, 1, 6)).toBe('human');
  });
});

describe('building', () => {
  it('only builds on pads nature may use, and charges for it', () => {
    const g = fresh();
    const human = PADS.find((p) => p.home === 'human')!.id;
    expect(g.buildCheck(human, 'anthill')).toEqual({ ok: false, why: 'ground' });
    const field = PADS.find((p) => !p.home && p.seg === 4)!.id;
    expect(g.buildCheck(field, 'anthill')).toEqual({ ok: false, why: 'ground' });
    const pad = homePad(g, 1);
    g.run.essence = 10;
    expect(g.buildCheck(pad, 'anthill')).toEqual({ ok: false, why: 'money' });
    g.run.essence = 100;
    expect(g.build(pad, 'anthill')).toBe(true);
    expect(g.run.essence).toBe(100 - BUILDINGS.anthill.cost);
    expect(g.buildCheck(pad, 'anthill')).toEqual({ ok: false, why: 'taken' });
    // Each further one costs more.
    expect(g.buildCost('anthill')).toBeGreaterThan(BUILDINGS.anthill.cost);
  });

  it('finishes construction, then sends units down the pad’s lane', () => {
    const g = fresh();
    quietHumans(g);
    const pad = homePad(g, 2);
    finish(g, 'meadow', homePad(g, 0));
    g.run.essence = 100;
    g.build(pad, 'anthill');
    g.advance(BUILDINGS.anthill.buildTime + 0.5);
    expect(g.run.buildings.find((b) => b.pad === pad)!.progress).toBe(1);
    g.advance(BUILDINGS.anthill.interval! + 0.5);
    const ants = g.run.units.filter((u) => u.kind === 'ant');
    expect(ants.length).toBeGreaterThan(0);
    expect(ants.every((u) => u.lane === 2)).toBe(true);
  });

  it('suggests a free pad and refunds half when demolishing', () => {
    const g = fresh();
    const pad = g.autoPad('den');
    expect(pad).not.toBeNull();
    g.run.essence = 1000;
    g.build(pad!, 'den');
    const b = g.run.buildings.find((x) => x.pad === pad)!;
    const before = g.run.essence;
    expect(g.demolish(b.id)).toBe(true);
    expect(g.run.essence).toBeCloseTo(before + Math.floor(BUILDINGS.den.cost / 2), 5);
  });
});

describe('food chain', () => {
  it('holds predators back until herbivores feed them', () => {
    const g = fresh();
    quietHumans(g);
    finish(g, 'den', homePad(g, 1));
    g.advance(BUILDINGS.den.interval! + 1);
    expect(g.run.units.filter((u) => u.kind === 'wolf').length).toBe(0);
    expect(g.run.buildings.find((b) => b.kind === 'den')!.blocked).toBe('meat');
    // Elk on grass make meat.
    finish(g, 'meadow', homePad(g, 0));
    finish(g, 'meadow', homePad(g, 0));
    finish(g, 'glade', homePad(g, 2));
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
    finish(g, 'meadow', homePad(g, 0));
    finish(g, 'glade', homePad(g, 2));
    g.advance(30);
    const elk = g.run.units.filter((u) => u.kind === 'elk');
    expect(elk.length).toBeGreaterThan(0);
    // The meadow goes: the elk have nothing to eat once the stock runs dry.
    g.run.buildings = g.run.buildings.filter((b) => b.kind !== 'meadow');
    const events: CoreEvent[] = [];
    g.on((e) => events.push(e));
    // Keep them home so nothing else hurts them.
    for (const u of g.run.units) u.x = 30;
    g.advance(BALANCE.nature.stockSeconds + 30);
    expect(events.some((e) => e.type === 'starving' && e.diet === 'grass')).toBe(true);
    expect(g.run.units.filter((u) => u.kind === 'elk').every((u) => u.hp < u.maxHp)).toBe(true);
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
    finish(g, 'meadow', homePad(g, 0));
    finish(g, 'anthill', homePad(g, 1));
    g.advance(5);
    const ant = g.run.units.find((u) => u.kind === 'ant')!;
    const before = ant.maxHp;
    g.run.essence = 1e6;
    expect(g.levelUp('ant')).toBe(true);
    expect(ant.maxHp).toBeCloseTo(before * (1 + BALANCE.levelPower), 5);
    expect(unitMaxHp('ant', g.run, g.mods)).toBeCloseTo(ant.maxHp, 5);
  });
});

describe('territory', () => {
  it('flips a stretch held by one side only, and a building holds its stretch', () => {
    const g = fresh();
    quietHumans(g);
    const lane = 1;
    // Park a mammoth in the middle stretch.
    finish(g, 'meadow', homePad(g, 0));
    finish(g, 'meadow', homePad(g, 0));
    finish(g, 'valley', homePad(g, 1));
    g.advance(BUILDINGS.valley.interval! + 2);
    const m = g.run.units.find((u) => u.kind === 'mammoth')!;
    m.x = 120 + 48 * 3.5;
    m.y = 160;
    g.run.units = [m];
    for (let i = 0; i < 40; i++) {
      m.x = 120 + 48 * 3.5;
      g.advance(0.5);
    }
    expect(segOwner(g.run, lane, 3)).toBe('nature');
    // A human building on stretch 5's pad keeps it from falling past neutral.
    const pad = PADS.find((p) => !p.home && p.lane === lane && p.seg === 5)!;
    g.run.segments[lane]![5] = -100;
    expect(padUser(g.run, pad.id)).toBe('human');
    g.run.buildings.push({ ...g.run.buildings.find((b) => b.side === 'human')!, id: 9999, kind: 'tower', pad: pad.id, x: pad.x, y: pad.y, progress: 1 });
    g.run.segments[lane]![5] = 100;
    m.x = 120 + 48 * 5.5;
    g.advance(0.2);
    expect(g.run.segments[lane]![5]).toBeLessThanOrEqual(BALANCE.territory.holdBuffer);
  });
});

describe('stages and runs', () => {
  it('goes from a fallen lodge to the pick, and on to a bigger camp', () => {
    const g = fresh();
    const events: string[] = [];
    g.on((e) => events.push(e.type));
    finish(g, 'den', homePad(g, 1));
    mainOf(g.run, 'human')!.hp = 0;
    g.advance(BALANCE.stage.pickDelay + 0.5);
    expect(events).toContain('stageWon');
    expect(g.run.phase).toBe('pick');
    expect(g.run.offer.length).toBe(3);
    expect(new Set(g.run.offer).size).toBe(3);
    const pick = g.run.offer[0]!;
    expect(g.choosePick(pick)).toBe(true);
    expect(g.run.picks).toEqual([pick]);
    expect(g.run.stage).toBe(2);
    expect(g.run.phase).toBe('battle');
    expect(g.run.units.length).toBe(0);
    // Nature keeps its home; the humans start bigger and tougher.
    expect(g.run.buildings.some((b) => b.kind === 'den')).toBe(true);
    expect(mainOf(g.run, 'human')!.maxHp).toBeCloseTo(BUILDINGS.lodge.hp * BALANCE.human.mainHpGrowth, 5);
    expect(g.run.buildings.filter((b) => b.side === 'human').length).toBeGreaterThan(2);
  });

  it('applies picks', () => {
    const g = fresh();
    const hp = unitMaxHp('ant', g.run, g.mods);
    g.run.picks.push('soldierAnts');
    // Picks fold in on the next change (choosePick does this itself).
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
    expect(g.run.essence).toBe(BALANCE.nature.start + 80);
    expect(g.state.meta.runs).toBe(1);
  });
});

describe('determinism and saves', () => {
  function play(seed: number): GameState {
    const g = fresh(seed);
    g.run.essence = 2000;
    g.build(homePad(g, 0), 'meadow');
    g.build(homePad(g, 0), 'meadow');
    g.build(homePad(g, 1), 'anthill');
    g.build(homePad(g, 2), 'glade');
    g.build(homePad(g, 2), 'ancient');
    g.advance(30);
    g.build(homePad(g, 1), 'den');
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
    // A loaded game keeps running.
    expect(back.run.phase).toBe('battle');
    const g = new Game(back);
    g.advance(5);
    expect(g.run.time).toBeGreaterThan(state.run.time);
  });

  it('starts afresh from an old-version save', () => {
    const s = deserialize({ version: 4, meta: { points: 50 }, run: null });
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.meta.genes).toBe(0);
    const g = new Game(s);
    expect(g.run.buildings.length).toBeGreaterThan(1);
  });
});
