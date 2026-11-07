import { describe, expect, it } from 'vitest';
import {
  BALANCE,
  CREATURES,
  CREATURE_BY_ID,
  D,
  DISASTERS,
  Game,
  LAIRS,
  SAVE_VERSION,
  computeMods,
  disasterResearchLoss,
  marchTime,
  raidRate,
  researchRate,
  SKILLS,
  SKILL_BY_ID,
  UPGRADES,
  createState,
  creatureCost,
  creatureCostN,
  creatureProd,
  deserialize,
  exportSave,
  formatDuration,
  formatNumber,
  importSave,
  maxAffordable,
  serialize,
  skillStatus,
  tideLevel,
  type GameState,
} from '../src/core/index.ts';

function rich(state: GameState = createState(), money = '1e40'): Game {
  const g = new Game(state);
  g.run.money = D(money);
  return g;
}

function openEras(g: Game, upTo: 2 | 3 | 4): void {
  const last = { 1: 'mammoth', 2: 'crocodile', 3: 'bison' } as const;
  for (let e = 2; e <= upTo; e++) {
    g.run.creatures[last[(e - 1) as 1 | 2 | 3]].bought = Math.max(1, g.run.creatures[last[(e - 1) as 1 | 2 | 3]].bought);
    expect(g.buyUpgrade(`era_${e}`)).toBe(true);
  }
}

describe('economy formulas', () => {
  it('cost grows by 1.15 per owned unit and bulk cost matches singles', () => {
    expect(creatureCost('ant', 0).toNumber()).toBeCloseTo(15);
    let sum = 0;
    for (let i = 7; i < 17; i++) sum += creatureCost('wolf', i).toNumber();
    expect(creatureCostN('wolf', 7, 10).toNumber()).toBeCloseTo(sum, 3);
  });

  it('max affordable never overspends and is tight', () => {
    for (const money of [14, 15, 100, 12345, 9.87e9]) {
      const n = maxAffordable('ant', 3, D(money));
      expect(creatureCostN('ant', 3, n).lte(money * (1 + 1e-9))).toBe(true);
      expect(creatureCostN('ant', 3, n + 1).gt(money)).toBe(true);
    }
  });

  it('tiers get more expensive and every era has five creatures', () => {
    for (let i = 1; i < CREATURES.length; i++) expect(CREATURES[i]!.baseCost).toBeGreaterThan(CREATURES[i - 1]!.baseCost);
    for (const e of [1, 2, 3, 4]) expect(CREATURES.filter((c) => c.era === e)).toHaveLength(5);
  });

  it('ids are unique across upgrades and skills', () => {
    const ids = [...UPGRADES.map((u) => u.id), ...SKILLS.map((s) => s.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('a run', () => {
  it('clicking earns money and buying spends it', () => {
    const g = new Game();
    for (let i = 0; i < 15; i++) g.click();
    expect(g.run.money.toNumber()).toBe(15);
    expect(g.buyCreature('ant', 1)).toBe(1);
    g.advance(10);
    expect(g.run.money.toNumber()).toBeCloseTo(10 * CREATURE_BY_ID.ant.baseProd, 5);
    expect(g.meta.lifetime.toNumber()).toBeGreaterThan(15);
  });

  it('one long advance matches many short ones (breeding and tide integrate exactly)', () => {
    const make = () => {
      const g = rich(createState(), '1e12');
      openEras(g, 2);
      g.buyCreature('locust', 30);
      g.buyCreature('crocodile', 5);
      g.buySkill('sw_nest');
      g.buySkill('ma_moon');
      g.run.nests = 3;
      // Keep the humans and the weather quiet so both runs stay identical.
      g.mods.researchMult = 0;
      g.run.nextDisaster = Infinity;
      return g;
    };
    const a = make();
    const b = make();
    a.advance(600);
    for (let i = 0; i < 600 * 20; i++) b.advance(0.05);
    expect(a.run.money.div(b.run.money).toNumber()).toBeCloseTo(1, 5);
    expect(a.run.creatures.locust.bred).toBeCloseTo(b.run.creatures.locust.bred, 3);
    expect(tideLevel(BALANCE.tide.period / 2)).toBeCloseTo(1);
  });

  it('wins when the bill is paid', () => {
    const g = new Game();
    g.run.earned = D(BALANCE.difficulty.normal.bill).mul(0.999);
    g.run.money = D(1e6);
    g.buyCreature('ant', 1);
    g.run.earned = D(BALANCE.difficulty.normal.bill);
    g.advance(0.1);
    expect(g.run.result?.won).toBe(true);
    expect(g.meta.wins.normal).toBe(1);
    expect(g.meta.points).toBe(g.run.result!.points);
    expect(g.meta.fastest.normal).toBeCloseTo(0.1);
    // A finished run ignores input.
    expect(g.click().toNumber()).toBe(0);
  });

  it('loses when research completes, and countermeasures hit the strongest class', () => {
    const g = rich();
    openEras(g, 2);
    g.buyCreature('ant', 50);
    g.buyCreature('boar', 30);
    const tankBefore = g.mods.classMult.tank;
    g.run.research = 0.199;
    g.advance(60);
    expect(g.run.countermeasures).toHaveLength(1);
    expect(g.run.countermeasures[0]!.cls).toBe('tank');
    // Tanks resist 60% of the hit: 1 − 0.5 × 0.4 = 0.8.
    expect(g.mods.classMult.tank / tankBefore).toBeCloseTo(0.8);
    g.run.research = 0.9999;
    g.advance(60);
    expect(g.run.result?.won).toBe(false);
    expect(g.run.countermeasures.length).toBe(4);
  });

  it('sabotage pushes research back and respects its cooldown', () => {
    const g = rich();
    openEras(g, 2);
    expect(g.buySkill('ge_sabotage')).toBe(true);
    g.run.research = 0.5;
    expect(g.activate('sabotage')).toBe(true);
    expect(g.run.research).toBeCloseTo(0.5 - BALANCE.actives.sabotage.amount);
    expect(g.activate('sabotage')).toBe(false);
  });
});

describe('taming', () => {
  it('wolves defect into dogs and the humans get stronger', () => {
    const g = rich();
    g.buyCreature('wolf', 60);
    const hunterBefore = g.mods.classMult.hunter;
    g.run.taming.wolf = 0.999;
    g.advance(5);
    expect(g.run.defected.wolf).toBe(60);
    expect(g.run.creatures.wolf.bought).toBe(0);
    expect(g.buyCreature('wolf', 1)).toBe(0);
    expect(g.mods.dogs).toBe(true);
    expect(g.mods.classMult.hunter).toBeLessThan(hunterBefore);
  });

  it('owning none means no taming, and rescue rolls it back', () => {
    const g = rich();
    g.advance(600);
    expect(g.run.taming.wolf ?? 0).toBe(0);
    g.buyCreature('wolf', 5);
    g.buySkill('hu_wild');
    g.buySkill('hu_rescue');
    g.advance(120);
    const before = g.run.taming.wolf!;
    expect(before).toBeGreaterThan(0);
    expect(g.activate('rescue')).toBe(true);
    expect(g.run.taming.wolf).toBeCloseTo(Math.max(0, before - BALANCE.actives.rescue.amount));
  });

  it('pigs speed research up and cost habitat', () => {
    const g = rich();
    openEras(g, 2);
    g.buyCreature('boar', 10);
    const research = g.researchRate();
    const global = g.mods.globalMult;
    g.run.taming.boar = 0.9999;
    g.advance(1);
    expect(g.run.defected.boar).toBe(10);
    expect(g.mods.globalMult).toBeLessThan(global);
    expect(g.researchRate()).toBeGreaterThan(research * 1.1);
  });
});

describe('lairs and raids', () => {
  it('raids come as fast as research, and stop when research does', () => {
    const g = rich();
    g.buyCreature('ant', 20);
    expect(raidRate(g.run, g.mods)).toBeCloseTo(researchRate(g.run, g.mods) * BALANCE.raids.perResearch);
    g.mods.researchMult = 0;
    g.run.nextDisaster = Infinity;
    g.advance(3600);
    expect(g.run.raid).toBeNull();
    expect(g.run.raidMeter).toBe(0);
  });

  it('a raid goes for the best earner and wrecks its lair unless repelled', () => {
    const g = rich();
    g.buyCreature('ant', 10);
    g.buyCreature('wolf', 20);
    const events: string[] = [];
    g.on((e) => events.push(e.type));
    g.run.raidMeter = 0.99999;
    g.advance(1);
    expect(g.run.raid?.target).toBe('wolf');
    expect(g.run.raid?.total).toBeCloseTo(marchTime('wolf'));
    const before = g.mods.creatureMult.wolf;
    g.advance(marchTime('wolf'));
    expect(g.run.raid).toBeNull();
    expect(g.run.lairs.wolf).toBeGreaterThan(0);
    expect(g.mods.creatureMult.wolf / before).toBeCloseTo(1 - BALANCE.lairs.loss);
    expect(events).toContain('raidLanded');
    // A wrecked lair is not raided again; the next target is the ant hill.
    g.run.raidMeter = 0.99999;
    g.advance(1);
    expect(g.run.raid?.target).toBe('ant');
    expect(g.repel()).toBe(true);
    expect(g.run.raid).toBeNull();
    expect(g.run.lairs.ant).toBeUndefined();
    expect(g.repel()).toBe(false);
    // The wolf den grows back on its own.
    g.advance(BALANCE.lairs.regrow);
    expect(g.run.lairs.wolf).toBeUndefined();
    expect(g.mods.creatureMult.wolf).toBeCloseTo(before);
    expect(events).toContain('lairRegrown');
  });

  it('lairs behind water take longer to reach', () => {
    expect(LAIRS.octopus.zone).toBe('coast');
    expect(marchTime('octopus')).toBeGreaterThan(marchTime('wolf'));
  });

  it('狡兔三窟 halves the loss and the time to regrow', () => {
    const g = rich();
    openEras(g, 2);
    expect(g.buySkill('ge_burrows')).toBe(true);
    g.buyCreature('rat', 10);
    g.run.raid = { target: 'rat', left: 0.5, total: 25 };
    const before = g.mods.creatureMult.rat;
    g.advance(1);
    expect(g.run.lairs.rat).toBeCloseTo(BALANCE.lairs.regrow * 0.5 - 0.5, 3);
    expect(g.mods.creatureMult.rat / before).toBeCloseTo(1 - BALANCE.lairs.loss * 0.5);
  });
});

describe('disasters', () => {
  const seeded = (seed: number) => {
    const s = createState();
    s.run.rng = seed;
    return rich(s);
  };

  it('the ice age stays quiet', () => {
    const g = seeded(1);
    g.mods.researchMult = 0;
    g.advance(3600);
    expect(g.run.disaster).toBeNull();
    expect(g.run.nextDisaster).toBe(BALANCE.disasters.first);
  });

  it('warn, hit, then wait: the same seed gives the same weather', () => {
    const play = () => {
      const g = seeded(42);
      openEras(g, 3);
      g.buyCreature('octopus', 10);
      g.buyCreature('pigeon', 10);
      g.buyCreature('bison', 10);
      g.buyCreature('mosquito', 10);
      g.run.research = 0.5;
      const log: string[] = [];
      g.on((e) => {
        if (e.type === 'disasterWarning' || e.type === 'disasterStarted' || e.type === 'disasterEnded') log.push(`${e.type}:${e.id}`);
      });
      g.advance(BALANCE.disasters.first + 0.001);
      expect(g.run.disaster?.phase).toBe('warning');
      return { g, log };
    };
    const a = play();
    const b = play();
    expect(a.g.run.disaster!.id).toBe(b.g.run.disaster!.id);

    const { g, log } = a;
    const def = DISASTERS[g.run.disaster!.id];
    const boostedBefore = computeMods(g.state).classMult[def.boost.cls];
    // The warning has run for 0.001 s already.
    g.advance(def.warn - 0.002);
    expect(g.run.disaster?.phase).toBe('warning');
    const research = g.run.research;
    g.advance(0.001);
    expect(g.run.disaster?.phase).toBe('active');
    expect(g.mods.classMult[def.boost.cls] / boostedBefore).toBeCloseTo(def.boost.x);
    expect(g.run.research).toBeCloseTo(research - disasterResearchLoss(g.run, def.id), 4);
    for (const id of g.run.disaster!.wrecked) {
      expect(LAIRS[id].zone).toBe(def.zone);
      expect(CREATURE_BY_ID[id].cls).not.toBe(def.boost.cls);
      expect(g.run.lairs[id]).toBeGreaterThan(0);
    }
    g.advance(def.duration);
    expect(g.run.disaster).toBeNull();
    expect(g.run.lastDisaster).toBe(def.id);
    expect(g.run.nextDisaster).toBeGreaterThanOrEqual(BALANCE.disasters.gap[0]);
    expect(g.run.nextDisaster).toBeLessThanOrEqual(BALANCE.disasters.gap[1]);
    expect(log).toEqual([`disasterWarning:${def.id}`, `disasterStarted:${def.id}`, `disasterEnded:${def.id}`]);
  });

  it('a tsunami spares the marines and hurts the humans more once they have a harbour', () => {
    const g = seeded(7);
    openEras(g, 2);
    g.run.research = 0.5;
    const early = disasterResearchLoss(g.run, 'tsunami');
    g.run.creatures.crocodile.bought = 1;
    expect(g.buyUpgrade('era_3')).toBe(true);
    expect(disasterResearchLoss(g.run, 'tsunami')).toBeGreaterThan(early);
    g.run.disaster = { id: 'tsunami', phase: 'warning', left: 0.5, wrecked: [] };
    g.advance(1);
    expect(g.run.disaster!.wrecked).toContain('mosquito');
    expect(g.run.disaster!.wrecked.some((id) => CREATURE_BY_ID[id].cls === 'marine')).toBe(false);
  });
});

describe('skill tree', () => {
  it('fork side B needs a meta unlock, and picking one side closes the other', () => {
    const g = rich();
    openEras(g, 3);
    g.buyCreature('ant', 10);
    g.buySkill('as_swarm');
    g.buySkill('as_resist');
    g.buyCreature('mosquito', 1);
    expect(skillStatus(g.run, g.mods, SKILL_BY_ID.as_panic!)).toBe('forkLocked');
    expect(g.buySkill('as_panic')).toBe(false);
    expect(g.buySkill('as_virus')).toBe(true);
    g.meta.levels.fork_assassin = 1;
    g.refreshMods();
    expect(skillStatus(g.run, g.mods, SKILL_BY_ID.as_panic!)).toBe('forkClosed');
  });

  it('convergent evolution turns mammoths into elephants without raising prices', () => {
    const g = rich();
    g.buyCreature('mammoth', 12);
    openEras(g, 4);
    const elephantCost = creatureCost('elephant', 0);
    expect(g.buySkill('tk_elephant')).toBe(true);
    expect(g.run.creatures.mammoth.bought).toBe(0);
    expect(g.run.creatures.elephant.bred).toBe(12);
    expect(creatureCost('elephant', g.run.creatures.elephant.bought).eq(elephantCost)).toBe(true);
  });

  it('ancient megafauna fade as eras advance', () => {
    const g = rich();
    g.buyCreature('mammoth', 1);
    const before = creatureProd(g.run, g.mods, 'mammoth').toNumber();
    openEras(g, 3);
    expect(creatureProd(g.run, g.mods, 'mammoth').toNumber()).toBeCloseTo(before * BALANCE.obsolete ** 2);
  });
});

describe('meta', () => {
  it('routes and difficulties unlock with points and wins', () => {
    const g = new Game();
    expect(g.startRun('plague', 'normal')).toBe(false);
    expect(g.startRun('beasts', 'hard')).toBe(false);
    g.meta.points = 100;
    expect(g.buyMeta('route_plague')).toBe(true);
    expect(g.startRun('plague', 'normal')).toBe(true);
    expect(g.run.skills.as_virus).toBe(true);
    g.meta.wins.normal = 1;
    expect(g.startRun('beasts', 'hard')).toBe(true);
    expect(g.run.difficulty).toBe('hard');
  });

  it('starting money perk applies to new runs', () => {
    const g = new Game();
    g.meta.points = 100;
    g.buyMeta('perk_savings');
    g.startRun();
    expect(g.run.money.toNumber()).toBe(500);
  });
});

describe('save', () => {
  it('round-trips through JSON and export strings', () => {
    const g = rich(createState(), '1.5e123');
    g.buyCreature('wolf', 3);
    g.run.taming.wolf = 0.4;
    g.run.countermeasures.push({ cls: 'tank', era: 2, at: 99 });
    g.meta.levels.perk_growth = 2;
    g.meta.lifetime = D('2e130');
    const back = deserialize(JSON.parse(JSON.stringify(serialize(g.state))));
    expect(back.run.money.eq(g.run.money)).toBe(true);
    expect(back.run.creatures.wolf.bought).toBe(3);
    expect(back.run.taming.wolf).toBe(0.4);
    expect(back.run.countermeasures[0]!.cls).toBe('tank');
    expect(back.meta.levels.perk_growth).toBe(2);
    expect(importSave(exportSave(g.state)).meta.lifetime.eq(g.meta.lifetime)).toBe(true);
  });

  it('keeps lairs, raids and disasters, and loads v2 saves with defaults', () => {
    const g = rich();
    g.run.lairs.wolf = 40;
    g.run.raid = { target: 'ant', left: 12, total: 25 };
    g.run.disaster = { id: 'tornado', phase: 'active', left: 9, wrecked: ['bison'] };
    g.run.nextDisaster = 77;
    g.run.lastDisaster = 'volcano';
    g.run.rng = 123456;
    const back = deserialize(JSON.parse(JSON.stringify(serialize(g.state))));
    expect(back.run.lairs.wolf).toBe(40);
    expect(back.run.raid).toEqual({ target: 'ant', left: 12, total: 25 });
    expect(back.run.disaster).toEqual({ id: 'tornado', phase: 'active', left: 9, wrecked: ['bison'] });
    expect(back.run.nextDisaster).toBe(77);
    expect(back.run.lastDisaster).toBe('volcano');
    expect(back.run.rng).toBe(123456);
    const old = deserialize({ version: 2, meta: {}, run: { money: '10', era: 2 } });
    expect(old.version).toBe(SAVE_VERSION);
    expect(old.run.lairs).toEqual({});
    expect(old.run.raid).toBeNull();
    expect(old.run.nextDisaster).toBe(BALANCE.disasters.first);
  });

  it('migrates a v1 save into meta progress', () => {
    const s = deserialize({ version: 1, lifetimeEarned: '1e20', genes: 400, money: '5' });
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.meta.lifetime.toNumber()).toBe(1e20);
    expect(s.meta.points).toBe(60);
    expect(s.run.result).toBeNull();
  });

  it('sanitises hostile input', () => {
    const s = deserialize({ version: 2, run: { money: 'NaN', era: 99, research: 7, skills: { nope: true } }, meta: { spent: 1e9 } });
    expect(s.run.money.toNumber()).toBe(0);
    expect(s.run.era).toBe(1);
    expect(s.run.research).toBe(1);
    expect(s.run.skills).toEqual({});
    expect(s.meta.spent).toBe(0);
    expect(() => importSave('garbage')).toThrow();
  });
});

describe('format', () => {
  it('uses short-scale English suffixes', () => {
    expect(formatNumber(1234)).toBe('1.23K');
    expect(formatNumber(4.5e15)).toBe('4.5Qa');
    expect(formatNumber(D('1.234e105'))).toBe('1.23e105');
    expect(formatDuration(3909)).toBe('1:05:09');
  });
});
